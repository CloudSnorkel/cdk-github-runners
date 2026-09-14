import { aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  ICompositeProvider,
  IParameterizedRunnerProvider,
  IRunnerProvider,
  IRunnerProviderStatus,
  isParameterizedRunnerProvider,
  DistributedRunnerConfig,
  RunnerConfig,
} from './common';

/**
 * Configuration for weighted distribution of runners.
 */
export interface WeightedRunnerProvider {
  /**
   * The runner provider to use.
   */
  readonly provider: IRunnerProvider;

  /**
   * Weight for this provider. Higher weights mean higher probability of selection.
   * Must be a positive number.
   */
  readonly weight: number;
}

/**
 * Add a fallback at the end of a config's fallback chain.
 */
function appendFallback(config: RunnerConfig, fallback: RunnerConfig): RunnerConfig {
  return {
    ...config,
    fallback: config.fallback ? appendFallback(config.fallback, fallback) : fallback,
  };
}

/**
 * A composite runner provider that implements fallback and distribution strategies.
 */
export class CompositeProvider {
  /**
   * Creates a fallback runner provider that tries each provider in order until one succeeds.
   *
   * For example, given providers A, B, C:
   * - Try A first
   * - If A fails, try B
   * - If B fails, try C
   *
   * You can use this to try spot instance first, and switch to on-demand instances if spot is unavailable.
   *
   * Or you can use this to try different instance types in order of preference.
   *
   * @param scope The scope in which to define this construct
   * @param id The scoped construct ID
   * @param providers List of runner providers to try in order
   */
  public static fallback(scope: Construct, id: string, providers: IRunnerProvider[]): ICompositeProvider {
    if (providers.length < 2) {
      throw new Error('At least two providers must be specified for fallback');
    }

    this.validateLabels(providers);
    this.validateParameterized(providers);

    return new FallbackRunnerProvider(scope, id, providers);
  }

  /**
   * Creates a weighted distribution runner provider that randomly selects a provider based on weights.
   *
   * For example, given providers A (weight 10), B (weight 20), C (weight 30):
   * - Total weight = 60
   * - Probability of selecting A = 10/60 = 16.67%
   * - Probability of selecting B = 20/60 = 33.33%
   * - Probability of selecting C = 30/60 = 50%
   *
   * You can use this to distribute load across multiple instance types or availability zones.
   *
   * @param scope The scope in which to define this construct
   * @param id The scoped construct ID
   * @param weightedProviders List of weighted runner providers
   */
  public static distribute(scope: Construct, id: string, weightedProviders: WeightedRunnerProvider[]): ICompositeProvider {
    if (weightedProviders.length < 2) {
      throw new Error('At least two providers must be specified for distribution');
    }

    // Validate labels
    this.validateLabels(weightedProviders.map(wp => wp.provider));
    this.validateParameterized(weightedProviders.map(wp => wp.provider));

    // Validate weights
    for (const wp of weightedProviders) {
      if (wp.weight <= 0) {
        throw new Error('All weights must be positive numbers');
      }
    }

    return new DistributedRunnerProvider(scope, id, weightedProviders);
  }

  /**
   * Validates that all providers have the exact same labels.
   * This is required so that any provisioned runner can match the labels requested by the GitHub workflow job.
   *
   * @param providers Providers to validate
   */
  private static validateLabels(providers: IRunnerProvider[]): void {
    const firstLabels = new Set(providers[0].labels);
    for (const provider of providers.slice(1)) {
      const providerLabels = new Set(provider.labels);
      if (firstLabels.size !== providerLabels.size || ![...firstLabels].every(label => providerLabels.has(label))) {
        throw new Error(`All providers must have the exact same labels (${[...firstLabels].join(', ')} != ${[...providerLabels].join(', ')})`);
      }
    }
  }

  /**
   * Make sure every provider is one of the built-in ones we know how to run.
   *
   * @param providers Providers to validate
   */
  private static validateParameterized(providers: IRunnerProvider[]): void {
    for (const provider of providers) {
      if (!isParameterizedRunnerProvider(provider)) {
        throw new Error(`${provider.node.path} is not a built-in runner provider. Only built-in providers are supported.`);
      }
    }
  }
}

/**
 * Internal implementation of fallback runner provider.
 *
 * The state machine does the actual falling back at runtime: every config can chain another one at `fallback`
 * to try when it fails. All we do here is chain the sub-provider configs in order.
 *
 * @internal
 */
class FallbackRunnerProvider extends Construct implements ICompositeProvider {
  public readonly labels: string[];
  public readonly providers: IRunnerProvider[];
  private readonly parameterized: IParameterizedRunnerProvider[];

  constructor(scope: Construct, id: string, providers: IRunnerProvider[]) {
    super(scope, id);
    this.labels = providers[0].labels;
    this.providers = providers;
    this.parameterized = providers as unknown as IParameterizedRunnerProvider[];
  }

  /**
   * @internal
   */
  _runnerConfig(): any {
    // chain all sub-provider configs
    // sub-providers can have their own fallback chains (EC2 subnets), so each one goes at the end of the last
    // fallback() only takes providers, never composites, so none of these is a distributed config
    return this.parameterized
      .map(p => p._runnerConfig() as RunnerConfig)
      .reduceRight((fallback, config) => appendFallback(config, fallback));
  }

  /**
   * @internal
   */
  _grantStateMachine(stateMachineRole: iam.IGrantable): void {
    for (const provider of this.parameterized) {
      provider._grantStateMachine(stateMachineRole);
    }
  }

  /**
   * @internal
   */
  _status(statusFunctionRole: iam.IGrantable): IRunnerProviderStatus[] {
    return this.parameterized.flatMap(provider => provider._status(statusFunctionRole));
  }
}

/**
 * Internal implementation of distributed runner provider.
 *
 * The state machine does the actual distributing at runtime: a config with a `distribute` list makes it pick one
 * of them at random by weight before running it.
 *
 * @internal
 */
class DistributedRunnerProvider extends Construct implements ICompositeProvider {
  public readonly labels: string[];
  public readonly providers: IRunnerProvider[];
  private readonly parameterized: IParameterizedRunnerProvider[];

  constructor(scope: Construct, id: string, private readonly weightedProviders: WeightedRunnerProvider[]) {
    super(scope, id);
    this.labels = weightedProviders[0].provider.labels;
    this.providers = weightedProviders.map(wp => wp.provider);
    this.parameterized = this.providers as unknown as IParameterizedRunnerProvider[];
  }

  /**
   * @internal
   */
  _runnerConfig(): DistributedRunnerConfig {
    // roll up the weights here so the state machine just picks the first config whose threshold is above a random
    // number in [0, totalWeight). both sums add the weights in the same order, so the last threshold always comes
    // out exactly equal to totalWeight and there is always a match
    let runningWeightSum = 0;
    return {
      totalWeight: this.weightedProviders.reduce((sum, wp) => sum + wp.weight, 0),
      distribute: this.weightedProviders.map(wp => ({
        threshold: runningWeightSum += wp.weight,
        config: (wp.provider as unknown as IParameterizedRunnerProvider)._runnerConfig(),
      })),
    };
  }

  /**
   * @internal
   */
  _grantStateMachine(stateMachineRole: iam.IGrantable): void {
    for (const provider of this.parameterized) {
      provider._grantStateMachine(stateMachineRole);
    }
  }

  /**
   * @internal
   */
  _status(statusFunctionRole: iam.IGrantable): IRunnerProviderStatus[] {
    return this.parameterized.flatMap(provider => provider._status(statusFunctionRole));
  }
}
