import { aws_iam as iam, aws_stepfunctions as stepfunctions } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ICompositeProvider, IRunnerProvider, IRunnerProviderStatus, nodePathWithoutStack, RunnerRuntimeParameters } from './common';

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

  constructor(scope: Construct, id: string, private readonly providers: IRunnerProvider[]) {
    super(scope, id);
    this.labels = providers[0].labels;
  }

  /**
   * Builds a Step Functions state machine that implements a fallback strategy.
   *
   * This method constructs a chain where each provider catches errors and falls back
   * to the next provider in sequence. We iterate forward through providers, attaching
   * catch handlers to each one (except the last) that route to the next provider.
   *
   * Example with providers [A, B, C]:
   * - Save firstProvider = A (this will be returned)
   * - Iteration 1 (i=0, provider A): A catches errors → falls back to B
   * - Iteration 2 (i=1, provider B): B catches errors → falls back to C
   * - Result: A → (on error) → B → (on error) → C
   *
   * Some providers generate one state while others (like EC2) may generate more complex chains.
   * We try to avoid creating a complicated state machine, but complex chains may require wrapping in Parallel.
   *
   * @param parameters Runtime parameters for the step function task
   * @returns A Step Functions chainable that implements the fallback logic
   */
  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable {
    // Get all provider chainables upfront
    const providerChainables = this.providers.map(p => p.getStepFunctionTask(parameters));

    // Track the entry point - starts as first provider, but may be wrapped
    let entryPoint = providerChainables[0];

    // Attach catch handlers to each provider (except the last) to fall back to the next provider
    for (let i = 0; i < this.providers.length - 1; i++) {
      const currentProvider = providerChainables[i];
      const nextProvider = providerChainables[i + 1];

      // Try to attach catch handler directly to the provider's end state
      // This is more efficient than wrapping in a Parallel state when possible
      if (currentProvider instanceof stepfunctions.State) {
        const endStates = currentProvider.endStates;
        if (endStates.length === 1 && endStates[0] instanceof stepfunctions.State) {
          // Single end state that is a State - try to add catch directly
          // Use 'any' type assertion because not all State types have addCatch in their type definition,
          // but Task states and other executable states do support it at runtime
          const endState = endStates[0] as any;
          if (typeof endState.addCatch === 'function') {
            // Attach catch handler: if this provider fails, fall back to next provider
            endState.addCatch(nextProvider, {
              errors: ['States.ALL'], // Catch all errors
              resultPath: `$.fallbackError${i + 1}`, // Store error info for debugging
            });
            continue;
          }
        }
      }

      // Fallback: wrap in Parallel state to add catch capability
      // This is needed when:
      // - The provider is not a State instance
      // - The provider has multiple end states
      // - The end state doesn't support addCatch directly
      const parallel = new stepfunctions.Parallel(this, `${nodePathWithoutStack(this)} attempt #${i + 1}`);
      parallel.branch(currentProvider);
      parallel.addCatch(nextProvider, {
        errors: ['States.ALL'],
        resultPath: `$.fallbackError${i + 1}`,
      });

      // If this is the first provider, update the entry point to the wrapped version
      if (i === 0) {
        entryPoint = parallel;
      }
    }

    return entryPoint;
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

  constructor(scope: Construct, id: string, private readonly weightedProviders: WeightedRunnerProvider[]) {
    super(scope, id);
    this.labels = weightedProviders[0].provider.labels;
  }

  /**
   * Weighted random selection algorithm:
   * 1. Generate a random number in [1, totalWeight+1)
   * 2. Build cumulative weight ranges for each provider (e.g., weights [10,20,30] -> ranges [1-10, 11-30, 31-60])
   * 3. Use Step Functions Choice state to route to the provider whose range contains the random number
   *    The first matching condition wins, so we check if rand <= cumulativeWeight for each provider in order
   */
  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable {
    const totalWeight = this.weightedProviders.reduce((sum, wp) => sum + wp.weight, 0);
    const rand = new stepfunctions.Pass(this, `${nodePathWithoutStack(this)} rand`, {
      parameters: {
        rand: stepfunctions.JsonPath.mathRandom(1, totalWeight + 1),
      },
      resultPath: '$.composite',
    });
    const choice = new stepfunctions.Choice(this, `${nodePathWithoutStack(this)} choice`);
    rand.next(choice);

    // Find provider with the highest weight
    let rollingWeight = 0;
    for (const wp of this.weightedProviders) {
      rollingWeight += wp.weight;
      choice.when(
        stepfunctions.Condition.numberLessThanEquals('$.composite.rand', rollingWeight),
        wp.provider.getStepFunctionTask(parameters),
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
