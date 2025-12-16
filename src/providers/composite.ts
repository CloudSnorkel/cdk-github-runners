import {
  aws_iam as iam,
  aws_stepfunctions as stepfunctions,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ICompositeProvider, IRunnerProvider, IRunnerProviderStatus, RunnerRuntimeParameters } from './common';

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
 * A composite runner provider that implements fallback and distribution strategies.
 */
export class CompositeProvider {
  /**
   * Creates a fallback runner provider that tries each provider in order until one succeeds.
   *
   * @param scope The scope in which to define this construct
   * @param id The scoped construct ID
   * @param providers List of runner providers to try in order
   */
  public static fallback(scope: Construct, id: string, providers: IRunnerProvider[]): ICompositeProvider {
    if (providers.length === 0) {
      throw new Error('At least one provider must be specified for fallback');
    }

    this.validateLabels(providers);

    return new FallbackRunnerProvider(scope, id, providers);
  }

  /**
   * Creates a weighted distribution runner provider that randomly selects a provider based on weights.
   *
   * @param scope The scope in which to define this construct
   * @param id The scoped construct ID
   * @param weightedProviders List of weighted runner providers
   */
  public static distribute(scope: Construct, id: string, weightedProviders: WeightedRunnerProvider[]): ICompositeProvider {
    if (weightedProviders.length === 0) {
      throw new Error('At least one provider must be specified for distribution');
    }

    // Validate labels
    this.validateLabels(weightedProviders.map(wp => wp.provider));

    // Validate weights
    for (const wp of weightedProviders) {
      if (wp.weight <= 0) {
        throw new Error('All weights must be positive numbers');
      }
    }

    return new DistributedRunnerProvider(scope, id, weightedProviders);
  }

  private static validateLabels(providers: IRunnerProvider[]): void {
    const firstLabels = new Set(providers[0].labels);
    for (const provider of providers.slice(1)) {
      const providerLabels = new Set(provider.labels);
      if (firstLabels.size !== providerLabels.size || ![...firstLabels].every(label => providerLabels.has(label))) {
        throw new Error(`All providers must have the exact same labels (${[...firstLabels].join(', ')} != ${[...providerLabels].join(', ')})`);
      }
    }
  }
}

/**
 * Internal implementation of fallback runner provider.
 *
 * @internal
 */
class FallbackRunnerProvider extends Construct implements ICompositeProvider {
  public readonly labels: string[];

  constructor(
    scope: Construct,
    id: string,
    private readonly providers: IRunnerProvider[],
  ) {
    super(scope, id);
    this.labels = providers[0].labels;
  }

  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable {
    if (this.providers.length === 1) {
      return this.providers[0].getStepFunctionTask(parameters);
    }

    // Build a recursive fallback structure
    let currentBranch = this.providers[0].getStepFunctionTask(parameters);

    for (let i = 1; i < this.providers.length; i++) {
      const nextProvider = this.providers[i].getStepFunctionTask(parameters);
      // TODO do we really need a ton of parallels here? can't we put the catch on the state directly? what if there are multiple states?
      const currentParallel = new stepfunctions.Parallel(this, `${this.node.id} Fallback Level ${i}`);

      currentParallel.branch(currentBranch);
      currentParallel.addCatch(nextProvider, {
        errors: ['States.ALL'], // Catch all errors
        resultPath: `$.fallbackError${i}`, // Store error info for debugging
      });

      currentBranch = currentParallel;
    }

    return currentBranch;
  }

  grantStateMachine(stateMachineRole: iam.IGrantable): void {
    for (const provider of this.providers) {
      provider.grantStateMachine(stateMachineRole);
    }
  }

  status(statusFunctionRole: iam.IGrantable): IRunnerProviderStatus[] {
    // Return statuses from all sub-providers
    return this.providers.map(provider => provider.status(statusFunctionRole));
  }
}

/**
 * Internal implementation of distributed runner provider.
 *
 * @internal
 */
class DistributedRunnerProvider extends Construct implements ICompositeProvider {
  public readonly labels: string[];

  constructor(
    scope: Construct,
    id: string,
    private readonly weightedProviders: WeightedRunnerProvider[],
  ) {
    super(scope, id);
    this.labels = weightedProviders[0].provider.labels;
  }

  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable {
    if (this.weightedProviders.length === 1) {
      return this.weightedProviders[0].provider.getStepFunctionTask(parameters);
    }

    const totalWeight = this.weightedProviders.reduce((sum, wp) => sum + wp.weight, 0);
    const rand = new stepfunctions.Pass(this, this.node.path.split('/').splice(1).join('/'), {
      parameters: {
        rand: stepfunctions.JsonPath.mathRandom(1, totalWeight + 1),
      },
      resultPath: '$.composite',
    });
    const choice = new stepfunctions.Choice(this, `${this.node.path.split('/').splice(1).join('/')} Weighted Distribution`);
    rand.next(choice);

    // Find provider with the highest weight
    let rollingWeight = 0;
    for (const wp of this.weightedProviders) {
      rollingWeight += wp.weight;
      const providerState = wp.provider.getStepFunctionTask(parameters) as stepfunctions.State; // TODO ugly
      // providerState.addPrefix(`${rollingWeight} `); // Prefix state names to ensure uniqueness
      choice.when(
        stepfunctions.Condition.numberLessThanEquals('$.composite.rand', rollingWeight),
        providerState,
      );
    }

    return rand;
  }

  grantStateMachine(stateMachineRole: iam.IGrantable): void {
    for (const wp of this.weightedProviders) {
      wp.provider.grantStateMachine(stateMachineRole);
    }
  }

  status(statusFunctionRole: iam.IGrantable): IRunnerProviderStatus[] {
    // Return statuses from all sub-providers
    return this.weightedProviders.map(wp => wp.provider.status(statusFunctionRole));
  }
}
