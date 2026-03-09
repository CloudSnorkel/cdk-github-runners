import * as crypto from 'crypto';
import * as cdk from 'aws-cdk-lib';
import {
  aws_events as events,
  aws_events_targets as events_targets,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ICompositeProvider, IRunnerProvider } from './providers';
import { GitHubRunners } from './runner';
import { WarmRunnerFillPayload } from './warm-runner-manager.lambda';

/**
 * Common properties for warm runner constructs.
 *
 * @internal
 */
export interface WarmRunnerBaseProps {
  /**
   * The GitHubRunners construct that owns the shared warm runner infrastructure.
   */
  readonly runners: GitHubRunners;

  /**
   * Provider to use. Warm runners bypass the provider selector — they always use
   * this provider, regardless of job characteristics. Labels cannot be modified.
   */
  readonly provider: IRunnerProvider | ICompositeProvider;

  /**
   * Number of warm runners to maintain.
   */
  readonly count: number;

  /**
   * GitHub owner where runners will be registered (org or user login).
   */
  readonly owner: string;

  /**
   * Registration level — must match how your runners are set up in GitHub. Choose
   * 'org' for org-wide runners, 'repo' for repo-level. See the setup wizard or
   * {@link SETUP_GITHUB.md} for choosing repo vs org.
   *
   * @default 'repo'
   */
  readonly registrationLevel?: 'org' | 'repo';

  /**
   * Repository name (without owner) where runners will be registered. Required when `registrationLevel` is 'repo'.
   */
  readonly repo?: string;
}

/**
 * Properties for always on warm runners.
 */
export interface AlwaysOnWarmRunnerProps extends WarmRunnerBaseProps { }

/**
 * Properties for scheduled warm runners.
 */
export interface ScheduledWarmRunnerProps extends WarmRunnerBaseProps {
  /**
   * When to start filling the pool (e.g. start of business hours).
   */
  readonly schedule: events.Schedule;

  /**
   * How long each should the warm runners be maintained from the fill time. Defines the end of the
   * window (schedule + duration).
   */
  readonly duration: cdk.Duration;
}

function buildWarmRunner(scope: Construct, props: WarmRunnerBaseProps, schedule: events.Schedule, duration: number): WarmRunnerFillPayload {
  const registrationLevel = props.registrationLevel ?? 'repo';
  if (registrationLevel === 'org' && props.repo) {
    throw new Error('Do not specify repo when registrationLevel is \'org\'');
  }
  if (registrationLevel === 'repo' && !props.repo) {
    throw new Error('repo is required when registrationLevel is \'repo\'');
  }

  const providerPath = props.provider.node.path;
  if (!props.runners.providers.some(p => p.node.path === providerPath)) {
    throw new Error(`Provider ${providerPath} is not in the providers list of the GitHubRunners construct`);
  }

  const labels = 'logGroup' in props.provider
    ? props.provider.labels
    : props.provider.providers[0]?.labels ?? [];

  const repo = registrationLevel === 'repo' ? props.repo! : '';
  const configHash = crypto.createHash('sha256')
    .update(JSON.stringify({ providerPath, providerLabels: labels, count: props.count, duration, owner: props.owner, repo }))
    .digest('hex')
    .slice(0, 16);

  const fillPayload: WarmRunnerFillPayload = {
    action: 'fill' as const,
    providerPath,
    providerLabels: labels,
    count: props.count,
    warmRunnerMaxIdleSeconds: duration, // TODO long ass name that's not entirely accurate
    owner: props.owner,
    repo,
    configHash,
  };

  const managerFn = props.runners._ensureWarmRunnerInfra();
  props.runners._registerWarmConfigHash(configHash);

  // Schedule to fill the warm pool (usually daily)
  new events.Rule(scope, 'Schedule', {
    schedule,
    targets: [new events_targets.LambdaFunction(managerFn, {
      event: events.RuleTargetInput.fromObject(fillPayload),
    })],
  });

  // Fill the warm pool immediately on deploy
  // Config hash changes will trigger draining of previous versions
  new cdk.CustomResource(scope, 'Initial Fill', {
    serviceToken: managerFn.functionArn,
    resourceType: 'Custom::WarmRunnerFill',
    properties: fillPayload,
  });

  return fillPayload;
}

/**
 * Warm runners that run 24/7. Fills at midnight UTC; each runner stays alive 24 hours.
 *
 * Runners will be provisioned using the specified provider and registered in the specified repository or organization.
 *
 * Registration level must match the one selected during setup. See {@link SETUP_GITHUB.md} for more information on the selection.
 *
 * ## Limitations
 *
 * - Jobs will still trigger provisioning of on-demand runners, even if a warm runner ends up being used.
 * - You may briefly see more than `count` runners when changing config or at rotation.
 * - To remove: set `count` to 0, deploy, wait for warm runners to stop, then remove and deploy again.
 * - Provider failures or timeouts (like Lambda provider timing out after 15 minutes) will result in a gap in coverage until the retry succeeds. Current retry mechanism has built-in back-off rate and can be tweaked using `retryOptions`. This will be improved in the future.
 *
 * @example
 * new AlwaysOnWarmRunner(stack, 'AlwaysOnLinux', {
 *   runners,
 *   provider: myProvider,
 *   count: 3,
 *   owner: 'my-org',
 *   repo: 'my-repo',
 * });
 */
export class AlwaysOnWarmRunner extends Construct {
  /**
   * The fill payload for this warm runner configuration.
   * @internal
   */
  public readonly _fillPayload: WarmRunnerFillPayload;

  constructor(scope: Construct, id: string, props: AlwaysOnWarmRunnerProps) {
    super(scope, id);
    this._fillPayload = buildWarmRunner(this, props, events.Schedule.cron({ hour: '0', minute: '0' }), cdk.Duration.days(1).toSeconds());
  }
}

/**
 * Warm runners active during a time window specified by start time (`schedule`) and duration (`duration`).
 *
 * Runners will be provisioned using the specified provider and registered in the specified repository or organization.
 *
 * Registration level must match the one selected during setup. See {@link SETUP_GITHUB.md} for more information on the selection.
 *
 * ## Limitations
 *
 * - Jobs will still trigger provisioning of on-demand runners, even if a warm runner ends up being used.
 * - You may briefly see more than `count` runners when changing config or at rotation.
 * - To remove: set `count` to 0, deploy, wait for warm runners to stop, then remove and deploy again.
 * - Provider failures or timeouts (like Lambda provider timing out after 15 minutes) will result in a gap in coverage until the retry succeeds. Current retry mechanism has built-in back-off rate and can be tweaked using `retryOptions`. This will be improved in the future.
 *
 * @example
 * new ScheduledWarmRunner(stack, 'BusinessHours', {
 *   runners,
 *   provider: myProvider,
 *   count: 3,
 *   owner: 'my-org',
 *   repo: 'my-repo',
 *   schedule: events.Schedule.cron({ hour: '13', minute: '0', weekDay: 'MON-FRI' }),
 *   duration: cdk.Duration.hours(2),
 * });
 */
export class ScheduledWarmRunner extends Construct {
  /**
   * The fill payload for this warm runner configuration.
   * @internal
   */
  public readonly _fillPayload: WarmRunnerFillPayload;

  constructor(scope: Construct, id: string, props: ScheduledWarmRunnerProps) {
    super(scope, id);
    this._fillPayload = buildWarmRunner(this, props, props.schedule, props.duration.toSeconds());
  }
}
