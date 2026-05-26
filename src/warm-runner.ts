import * as crypto from 'crypto';
import * as cdk from 'aws-cdk-lib';
import {
  aws_events as events,
  aws_events_targets as events_targets,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CronExpressionParser } from 'cron-parser';
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
   * 'org' for org-wide runners, 'repo' for repo-level. See the setup wizard for choosing repo vs org.
   *
   * @see https://github.com/CloudSnorkel/cdk-github-runners/blob/main/SETUP_GITHUB.md
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
   * How long the warm runners should be maintained from the fill time (schedule). Defines the end of the
   * window (schedule time + duration).
   */
  readonly duration: cdk.Duration;
}

function buildWarmRunner(scope: Construct, props: WarmRunnerBaseProps, schedule: events.Schedule, duration: number, createInitialFill: boolean) {
  const registrationLevel = props.registrationLevel ?? 'repo';
  if (registrationLevel === 'org' && props.repo) {
    cdk.Annotations.of(scope).addError('Do not specify repo when registrationLevel is \'org\'');
  }
  if (registrationLevel === 'repo' && !props.repo) {
    cdk.Annotations.of(scope).addError('repo is required when registrationLevel is \'repo\'');
  }

  const providerPath = props.provider.node.path;
  if (!props.runners.providers.some(p => p.node.path === providerPath)) {
    cdk.Annotations.of(scope).addError(`Provider ${providerPath} is not in the providers list of the GitHubRunners construct`);
  }

  const labels = props.provider.labels;

  const repo = registrationLevel === 'repo' ? (props.repo ?? '') : '';
  const configHash = crypto.createHash('sha256')
    .update(JSON.stringify({ providerPath, providerLabels: labels, count: props.count, duration, owner: props.owner, repo }))
    .digest('hex')
    .slice(0, 16);

  const fillPayload: WarmRunnerFillPayload = {
    action: 'fill' as const,
    providerPath,
    providerLabels: labels,
    count: props.count,
    duration,
    owner: props.owner,
    repo,
    configHash,
  };

  const { lambda: managerFn, queue } = props.runners._ensureWarmRunnerInfra();
  props.runners._registerWarmConfigHash(configHash);

  // Schedule to fill the warm pool (usually daily). Sends to SQS so we get stable messageId for idempotent fills.
  new events.Rule(scope, 'Schedule', {
    schedule,
    targets: [new events_targets.SqsQueue(queue, {
      message: events.RuleTargetInput.fromObject(fillPayload),
    })],
  });

  // Fill the warm pool immediately on deploy (AlwaysOnWarmRunner only).
  // ScheduledWarmRunner does not get deployment-fill. First fill happens at the next schedule fire.
  if (createInitialFill) {
    new cdk.CustomResource(scope, 'Initial Fill', {
      serviceToken: managerFn.functionArn,
      resourceType: 'Custom::WarmRunnerFill',
      properties: fillPayload,
    });
  }

  return fillPayload;
}

/**
 * Warm runners that run 24/7. Fills at midnight UTC and each runner stays alive for 24 hours.
 *
 * Runners will be provisioned using the specified provider and registered in the specified repository or organization.
 *
 * Registration level must match the one selected during setup.
 *
 * @see https://github.com/CloudSnorkel/cdk-github-runners/blob/main/SETUP_GITHUB.md
 *
 * ## Limitations
 *
 * - Jobs will still trigger provisioning of on-demand runners, even if a warm runner ends up being used.
 * - You may briefly see more than `count` runners when changing config or at rotation.
 * - To remove: set `count` to 0, deploy, wait for warm runners to stop, then remove and deploy again.
 *   If you don't follow this procedure, warm runners may linger until they expire.
 * - Provider failures or timeouts (like Lambda provider timing out after 15 minutes) will result in a
 *   gap in coverage until the retry succeeds. Current retry mechanism has built-in back-off rate and
 *   can be tweaked using `retryOptions`. This will be improved in the future.
 *
 * ```typescript
 * new AlwaysOnWarmRunner(stack, 'AlwaysOnLinux', {
 *   runners,
 *   provider: myProvider,
 *   count: 3,
 *   owner: 'my-org',
 *   repo: 'my-repo',
 * });
 * ```
 */
export class AlwaysOnWarmRunner extends Construct {
  /**
   * The fill payload for this warm runner configuration.
   * @internal
   */
  public readonly _fillPayload: WarmRunnerFillPayload;

  constructor(scope: Construct, id: string, props: AlwaysOnWarmRunnerProps) {
    super(scope, id);
    this._fillPayload = buildWarmRunner(this, props, events.Schedule.cron({ hour: '0', minute: '0' }), cdk.Duration.days(1).toSeconds(), true);
  }
}

/**
 * Convert AWS EventBridge cron format to cron-parser format.
 * AWS: cron(min hour dom month dow year), cron-parser: sec min hour dom month dow
 */
function awsCronToParserFormat(expressionString: string): string {
  const match = expressionString.match(/^cron\((.+)\)$/);
  if (!match) return expressionString;
  const [, inner] = match;
  const parts = inner.trim().split(/\s+/);
  if (parts.length !== 6) return expressionString;
  const [minute, hour, dom, month, dow] = parts;
  return `0 ${minute} ${hour} ${dom} ${month} ${dow}`;
}

/**
 * Parse AWS EventBridge rate expression and return interval in seconds.
 * Format: rate(value unit) e.g. rate(2 hours), rate(5 minutes), rate(1 day)
 */
function parseRateInterval(expressionString: string): number | undefined {
  const match = expressionString.match(/^rate\((\d+)\s+(minute|minutes|hour|hours|day|days)\)$/i);
  if (!match) return undefined;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (value <= 0) return undefined;
  const secondsPerUnit: Record<string, number> = {
    minute: 60,
    minutes: 60,
    hour: 3600,
    hours: 3600,
    day: 86400,
    days: 86400,
  };
  return value * secondsPerUnit[unit];
}

/**
 * Get the interval between schedule occurrences in seconds.
 * Supports both cron and rate expressions.
 */
function getScheduleIntervalSeconds(expressionString: string): number | undefined {
  const rateInterval = parseRateInterval(expressionString);
  if (rateInterval !== undefined) return rateInterval;

  try {
    const cronExpression = CronExpressionParser.parse(awsCronToParserFormat(expressionString));
    const next = cronExpression.take(2);
    return (next[1].getTime() - next[0].getTime()) / 1000;
  } catch {
    return undefined;
  }
}

/**
 * Warm runners active during a time window specified by start time (`schedule`) and duration (`duration`).
 *
 * Runners will be provisioned using the specified provider and registered in the specified repository or organization.
 *
 * Registration level must match the one selected during setup.
 *
 * @see https://github.com/CloudSnorkel/cdk-github-runners/blob/main/SETUP_GITHUB.md
 *
 * ## Limitations
 *
 * - **No deployment-fill**: Unlike `AlwaysOnWarmRunner`, scheduled warm runners do not get an initial
 *   fill on deploy. The first fill happens at the next schedule occurrence. If you deploy at 1pm for
 *   a 2pm schedule, runners will not appear until 2pm.
 * - Jobs will still trigger provisioning of on-demand runners, even if a warm runner ends up being used.
 * - You may briefly see more than `count` runners when changing config or at rotation.
 * - To remove: set `count` to 0, deploy, wait for warm runners to stop, then remove and deploy again.
 *   If you don't follow this procedure, warm runners may linger until they expire.
 * - Provider failures or timeouts (like Lambda provider timing out after 15 minutes) will result in a
 *   gap in coverage until the retry succeeds. Current retry mechanism has built-in back-off rate and
 *   can be tweaked using `retryOptions`. This will be improved in the future.
 *
 * ```typescript
 * // Cron: fill at 1pm on weekdays
 * new ScheduledWarmRunner(stack, 'Business Hours', {
 *   runners,
 *   provider: myProvider,
 *   count: 3,
 *   owner: 'my-org',
 *   repo: 'my-repo',
 *   schedule: events.Schedule.cron({ hour: '13', minute: '0', weekDay: 'MON-FRI' }),
 *   duration: cdk.Duration.hours(2),
 * });
 * ```
 *
 * ```typescript
 * // Rate: fill every 12 hours
 * new ScheduledWarmRunner(stack, 'Every 12 Hours', {
 *   runners,
 *   provider: myProvider,
 *   count: 2,
 *   owner: 'my-org',
 *   repo: 'my-repo',
 *   schedule: events.Schedule.rate(cdk.Duration.hours(5)),
 *   duration: cdk.Duration.hours(12),
 * });
 * ```
 */
export class ScheduledWarmRunner extends Construct {
  /**
   * The fill payload for this warm runner configuration.
   * @internal
   */
  public readonly _fillPayload: WarmRunnerFillPayload;

  constructor(scope: Construct, id: string, props: ScheduledWarmRunnerProps) {
    super(scope, id);

    // make sure the duration is not longer than the interval between next two schedule occurrences
    const interval = getScheduleIntervalSeconds(props.schedule.expressionString);
    if (interval !== undefined && interval < props.duration.toSeconds()) {
      cdk.Annotations.of(this).addError(`ScheduledWarmRunner duration ${props.duration.toHumanString()} is longer than the interval ${cdk.Duration.seconds(interval).toHumanString()} between next two schedule occurrences. This will result in overlapping warm runners at the start of the next schedule occurrence.`);
    }

    // warn for short interval
    if (interval !== undefined && interval < cdk.Duration.hours(1).toSeconds()) {
      cdk.Annotations.of(this).addWarningV2(
        '@cloudsnorkel/cdk-github-runners:ScheduledWarmRunner.intervalTooShort',
        `ScheduledWarmRunner interval ${cdk.Duration.seconds(interval).toHumanString()} is less than 1 hour, which may result in more warm runners than expected`,
      );
    }

    this._fillPayload = buildWarmRunner(this, props, props.schedule, props.duration.toSeconds(), false);
  }
}
