/**
 * Warm Runner Manager Lambda
 *
 * Maintains a pool of pre-provisioned ("warm") GitHub self-hosted runners so jobs
 * start with near-zero latency instead of waiting for a fresh runner to provision.
 *
 * ## Lifecycle
 *
 * 1. **Fill** — An EventBridge cron rule (midnight UTC for always-on, or window
 *    start for scheduled) sends a fill payload to the shared SQS queue. For
 *    AlwaysOnWarmRunner only, a CloudFormation custom resource (on deploy)
 *    invokes this Lambda directly to fill immediately; the deadline is set to
 *    the next midnight UTC (not full 24h) so runners last until the next cron
 *    fill. ScheduledWarmRunner has no deployment-fill — first fill is at the
 *    next schedule occurrence.
 *
 * 2. **Keeper** — Each keeper message tracks one runner. The SQS queue delivers the
 *    message, this Lambda inspects the runner, and one of the following happens:
 *    - Runner is past its deadline → the keeper stops the Step Function and deletes
 *      the runner. No replacement is created.
 *    - Runner is idle and within deadline → message is returned to the queue
 *      (via batch item failure) to be checked again after the visibility timeout.
 *    - Runner is busy or its Step Function finished → a replacement runner is
 *      started with the same deadline, and a new keeper message is enqueued.
 *    - Config hash mismatch (config was changed/removed since this runner was
 *      created) → the runner is stopped and deleted. No replacement is created.
 *      This is how old runners are cleaned up quickly on config changes.
 *
 * 3. **Shutdown mechanisms** — The keeper is the primary mechanism for enforcing the
 *    absolute deadline: when a runner is past its deadline, the keeper stops the
 *    Step Function and deletes the runner. Fallbacks:
 *    - **Idle reaper**: Measures idle time from runner *registration* (cdkghr:started
 *      label), not step function start. So it fires at deadline + provisioning delay.
 *      It's a fallback if the keeper misses a message; it does not enforce the
 *      absolute deadline precisely.
 *    - **Step Function idle timeout**: Each runner is started with `maxIdleSeconds`
 *      matching the deadline. If both keeper and idle reaper miss it, the Step
 *      Function will self-terminate when its idle timeout fires.
 *
 * ## Config hash
 *
 * Each warm runner config (provider, count, labels, owner, repo, duration) is
 * hashed at CDK synth time. All current hashes are stored in the WARM_CONFIG_HASHES
 * environment variable. Fill payloads and keeper messages carry the hash. When the
 * keeper processes a message whose hash is not in the current set, it knows the
 * config was changed or removed and stops the runner immediately. This helps quickly
 * get rid of stale runners while keeping over-provisioning to a minimum.
 *
 * ## Gotchas
 *
 * - Keeper messages rely on SQS redelivery (batch item failure) for periodic
 *   checking. The visibility timeout (1 min) determines how often runners are
 *   polled. Failed messages are retried until they succeed or the runner
 *   self-terminates at its idle timeout.
 * - Each fill unconditionally starts `count` runners — it does not check how many
 *   are already running. On cron fire, this creates a brief overlap with the
 *   previous cycle's runners (which are near their deadline).
 * - Removing all warm runners configurations may result in warm runners staying
 *   around until they expire. To remove all warm runners quickly, set count to 0
 *   and deploy. Only once all the warm runners are stopped, you can remove all
 *   configurations and deploy again.
 * - **Gaps in coverage**: The Step Function that provisions each warm runner uses
 *   increasing timeouts between retries for provider failures (CodeBuild timeout,
 *   Lambda timeout, capacity errors, etc.). While a warm runner slot is retrying,
 *   that slot has no runner. This may create gaps in coverage. An idle warm runner
 *   that fails to provision (or whose replacement fails) will be unavailable until
 *   the retry succeeds. Current retry mechanism has built-in back-off rate and can
 *   be tweaked using `retryOptions`. This will be improved in the future.
 */
import * as crypto from 'crypto';
import {
  DescribeExecutionCommand,
  SFNClient,
  StartExecutionCommand,
  StopExecutionCommand,
  ExecutionAlreadyExists,
} from '@aws-sdk/client-sfn';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { Octokit } from '@octokit/rest';
import * as AWSLambda from 'aws-lambda';
import { deleteRunner, getAppOctokit, getOctokit, getRunner, GitHubSecrets } from './lambda-github';
import { customResourceRespond } from './lambda-helpers';

const sfn = new SFNClient();
const sqs = new SQSClient();

const SFN_EXECUTION_NAME_MAX_LENGTH = 80;

export interface WarmRunnerKeeperMessage {
  readonly executionArn: string;
  readonly runnerName: string;
  readonly owner: string;
  readonly repo: string;
  readonly installationId?: number;
  readonly providerPath: string;
  readonly providerLabels: string[];
  readonly absoluteDeadline: number; // Unix ms — inherited by replacements
  readonly configHash: string;
}

/**
 * @internal
 */
export interface WarmRunnerFillPayload {
  readonly action: 'fill';
  readonly providerPath: string;
  readonly providerLabels: string[];
  readonly count: number;
  readonly duration: number;
  readonly owner: string;
  readonly repo: string;
  readonly configHash: string;
}

function isSqsEvent(event: unknown): event is AWSLambda.SQSEvent {
  return Array.isArray((event as AWSLambda.SQSEvent).Records);
}

function isFillInput(event: unknown): event is WarmRunnerFillPayload {
  return typeof event === 'object' && event !== null && (event as WarmRunnerFillPayload).action === 'fill';
}

function isCustomResourceEvent(event: unknown): event is AWSLambda.CloudFormationCustomResourceEvent {
  const e = event as AWSLambda.CloudFormationCustomResourceEvent;
  return typeof e?.RequestType === 'string' && typeof e?.ResponseURL === 'string';
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

interface StartWarmRunnerInput {
  readonly providerPath: string;
  readonly providerLabels: string[];
  readonly owner: string;
  readonly repo: string;
  readonly installationId?: number;
  readonly absoluteDeadline: number; // Unix ms
  readonly configHash: string;
  readonly executionName: string;
  readonly slot?: number; // 0-based index when filling multiple slots; helps correlate logs
}

/**
 * Deterministic execution name for idempotent fills. Same seed → same name, so retries
 * (custom resource, SQS redelivery) don't create duplicate runners.
 */
function deterministicExecutionName(providerPath: string, seed: string) {
  const pathWithoutStack = providerPath.split('/').slice(1).join('/') || providerPath;
  const sanitized = `warm-${pathWithoutStack.replace(/[^a-zA-Z0-9-]/g, '-')}`;
  const hash = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
  const maxPrefixLen = SFN_EXECUTION_NAME_MAX_LENGTH - hash.length - 1;
  return `${sanitized.slice(0, maxPrefixLen)}-${hash}`;
}

/** Returns Unix ms of the next midnight UTC. Used for AlwaysOn deployment-fill deadline. */
function getNextMidnightUtcMs(): number {
  const now = new Date();
  const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  return nextMidnight.getTime();
}

/** Find installation id for our app. Normal code path gets this from the webhook payload, but we schedule these ourselves. */
async function resolveInstallationId(owner: string, repo: string) {
  const appOctokit = await getAppOctokit();
  if (!appOctokit) {
    return undefined; // PAT authentication
  }

  if (repo) {
    const { data } = await appOctokit.rest.apps.getRepoInstallation({ owner, repo });
    return data.id;
  } else {
    const { data } = await appOctokit.rest.apps.getOrgInstallation({ org: owner });
    return data.id;
  }
}

/** Start a warm runner and enqueue a keeper message using SQS. */
async function startWarmRunnerAndEnqueueKeeper(input: StartWarmRunnerInput) {
  const stepFunctionArn = requireEnv('STEP_FUNCTION_ARN');
  const queueUrl = requireEnv('WARM_RUNNER_QUEUE_URL');

  const remainingSeconds = Math.floor((input.absoluteDeadline - Date.now()) / 1000);
  if (remainingSeconds <= 0) {
    console.log({
      notice: 'Absolute deadline already passed; not starting replacement',
      configHash: input.configHash,
      runnerName: input.executionName,
      input,
    });
    return;
  }

  let executionArn: string;
  try {
    const result = await sfn.send(new StartExecutionCommand({
      stateMachineArn: stepFunctionArn,
      name: input.executionName,
      input: JSON.stringify({
        owner: input.owner,
        repo: input.repo || '',
        jobId: -1,
        jobUrl: '',
        installationId: input.installationId ?? -1,
        jobLabels: input.providerLabels.join(','),
        provider: input.providerPath,
        labels: [...input.providerLabels, 'cdkghr:warm'].join(','),
        maxIdleSeconds: remainingSeconds,
      }),
    }));
    executionArn = result.executionArn!;
  } catch (e) {
    if (e instanceof ExecutionAlreadyExists) {
      // Idempotent retry: execution was already started (e.g. Lambda timed out mid-fill).
      // Don't enqueue. The first attempt already did, so duplicate keeper messages would cause duplicate replacements.
      console.log({
        notice: 'ExecutionAlreadyExists — idempotent retry, skipping enqueue',
        configHash: input.configHash,
        slot: input.slot,
        runnerName: input.executionName,
      });
      return;
    } else {
      throw e;
    }
  }

  const message: WarmRunnerKeeperMessage = {
    executionArn,
    runnerName: input.executionName,
    owner: input.owner,
    repo: input.repo,
    installationId: input.installationId,
    providerPath: input.providerPath,
    providerLabels: input.providerLabels,
    absoluteDeadline: input.absoluteDeadline,
    configHash: input.configHash,
  };

  await sqs.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(message),
  }));

  console.log({
    notice: 'Started warm runner and enqueued keeper message',
    configHash: input.configHash,
    slot: input.slot,
    runnerName: input.executionName,
    executionArn,
    remainingSeconds,
  });
}

/**
 * Unconditionally starts `count` warm runners for the given config and enqueues keeper messages.
 *
 * @param input the fill payload
 * @param getNameForSlot a function to generate a unique and stable execution name for each slot
 * @param source the source of the fill for debugging purposes
 * @param absoluteDeadlineOverride if provided, use this instead of now + duration (for AlwaysOn deployment-fill)
 */
async function runFiller(input: WarmRunnerFillPayload, getNameForSlot: (slot: number) => string, source: string, absoluteDeadlineOverride?: number) {
  const installationId = await resolveInstallationId(input.owner, input.repo);
  const absoluteDeadline = absoluteDeadlineOverride ?? Date.now() + input.duration * 1000;

  for (let i = 0; i < input.count; i++) {
    await startWarmRunnerAndEnqueueKeeper({
      providerPath: input.providerPath,
      providerLabels: input.providerLabels,
      owner: input.owner,
      repo: input.repo,
      installationId,
      absoluteDeadline,
      configHash: input.configHash,
      executionName: getNameForSlot(i),
      slot: i,
    });
  }

  console.log({
    notice: 'Fill complete - started warm runners',
    source,
    configHash: input.configHash,
    providerPath: input.providerPath,
    started: input.count,
  });
}

/** Stop the step function and delete the runner from GitHub. */
async function stopAndDeleteRunner(input: WarmRunnerKeeperMessage, octokit: Octokit, secrets: GitHubSecrets, reason: string) {
  try {
    await sfn.send(new StopExecutionCommand({
      executionArn: input.executionArn,
      error: reason,
      cause: 'Warm runner stopped by keeper',
    }));
  } catch (e) {
    console.error({
      notice: 'Failed to stop step function',
      configHash: input.configHash,
      runnerName: input.runnerName,
      executionArn: input.executionArn,
      error: e,
      input,
    });
  }

  const runner = await getRunner(octokit, secrets.runnerLevel, input.owner, input.repo, input.runnerName);
  if (runner) {
    try {
      await deleteRunner(octokit, secrets.runnerLevel, input.owner, input.repo, runner.id);
    } catch (e) {
      console.error({
        notice: 'Failed to delete runner',
        configHash: input.configHash,
        runnerName: input.runnerName,
        runnerId: runner.id,
        error: e,
        input,
      });
    }
  }
}

/**
 * Warm runner manager Lambda - handles three invocation modes:
 *
 * 1. CloudFormation Custom Resource - triggered on stack deploy (Create/Update) for AlwaysOnWarmRunner only. Runs
 *    runFiller with deadline = next midnight UTC so runners last until the next cron fill. Delete is a no-op.
 * 2. SQS messages - fill or keeper
 *    - Fill - from EventBridge cron. Uses messageId for deterministic execution names (idempotent on redelivery).
 *    - Keeper - tracks one runner. Uses SQS message cycling for periodic checks.
 *      Each message tracks one warm runner. The keeper checks:
 *      - Past deadline - stop the Step Function and delete the runner.
 *      - Config hash - if the message's `configHash` doesn't match the current `WARM_CONFIG_HASHES` env var, the runner is from a stale config - stop it and discard the message without replacement.
 *      - Busy/finished - if the Step Function ended or the GitHub runner is busy (took a job), start a replacement runner (inheriting the same deadline and config hash).
 *      - Not found yet (runner/infrastructure still starting) - retry later (message goes back to queue).
 *      - Still idle - retry later to check again.
 */
export async function handler(event: AWSLambda.SQSEvent | AWSLambda.CloudFormationCustomResourceEvent) {
  if (isCustomResourceEvent(event)) {
    const physicalId = ('PhysicalResourceId' in event ? event.PhysicalResourceId : undefined) ?? event.LogicalResourceId;
    try {
      const props = event.ResourceProperties as unknown as WarmRunnerFillPayload;
      console.log({
        notice: 'Custom resource fill',
        requestType: event.RequestType,
        logicalResourceId: event.LogicalResourceId,
        configHash: props.configHash,
        providerPath: props.providerPath,
        count: props.count,
      });
      if (event.RequestType === 'Create' || event.RequestType === 'Update') {
        const getNameForSlot = (slot: number) =>
          deterministicExecutionName(props.providerPath, `${event.LogicalResourceId}:${event.RequestType}:${props.configHash}:${slot}`);
        const deadline = getNextMidnightUtcMs();
        await runFiller(props, getNameForSlot, 'customResource', deadline);
      }
      await customResourceRespond(event, 'SUCCESS', 'OK', physicalId, {});
    } catch (e) {
      console.error({ notice: 'Custom resource handler failed', error: e });
      await customResourceRespond(event, 'FAILED', (e as Error).message || 'Internal Error', physicalId, {});
    }
    return;
  }

  if (!isSqsEvent(event)) {
    console.error({ notice: 'Unknown event type; ignoring', event });
    return;
  }

  const validHashes = new Set((process.env.WARM_CONFIG_HASHES ?? '').split(',').filter(Boolean));
  const result: AWSLambda.SQSBatchResponse = { batchItemFailures: [] };
  const octokitCache = new Map<number | undefined, { octokit: Octokit; secrets: GitHubSecrets }>();

  for (const record of event.Records) {
    let body: WarmRunnerKeeperMessage | WarmRunnerFillPayload;
    try {
      body = JSON.parse(record.body) as WarmRunnerKeeperMessage | WarmRunnerFillPayload;
    } catch (e) {
      console.error({
        notice: 'Failed to parse message body',
        requestId: record.messageId,
        error: e,
      });
      continue;
    }

    const retryLater = () => result.batchItemFailures.push({ itemIdentifier: record.messageId });

    const isFill = isFillInput(body);
    const configHash = (body as WarmRunnerFillPayload & WarmRunnerKeeperMessage).configHash;
    const runnerName = isFill ? undefined : (body as WarmRunnerKeeperMessage).runnerName;
    console.log({
      notice: 'Processing SQS message',
      messageId: record.messageId,
      configHash,
      runnerName,
    });

    // scheduled fill from EventBridge via SQS
    if (isFill) {
      const fillPayload = body as WarmRunnerFillPayload;
      try {
        console.log({
          notice: 'Scheduled fill',
          configHash,
          providerPath: fillPayload.providerPath,
          count: fillPayload.count,
        });
        const getNameForSlot = (slot: number) =>
          deterministicExecutionName(fillPayload.providerPath, `${record.messageId}:${slot}`);
        await runFiller(fillPayload, getNameForSlot, 'scheduled', undefined);
      } catch (e) {
        console.error({
          notice: 'Fill failed',
          messageId: record.messageId,
          configHash: fillPayload.configHash,
          error: e,
        });
        retryLater();
      }
      continue;
    }

    // keeper message
    const input = body as WarmRunnerKeeperMessage;
    console.log({
      notice: 'Checking warm runner',
      configHash: input.configHash,
      runnerName: input.runnerName,
    });

    // get github access (cached per installationId to avoid re-reading the secrets manager and Github API every time)
    let octokit: Octokit;
    let secrets: GitHubSecrets;
    const cached = octokitCache.get(input.installationId);
    if (cached) {
      octokit = cached.octokit;
      secrets = cached.secrets;
    } else {
      const got = await getOctokit(input.installationId);
      octokit = got.octokit;
      secrets = got.githubSecrets;
      octokitCache.set(input.installationId, { octokit, secrets });
    }

    // stale config - best-effort stop, then discard message (runner will self-terminate at its idle timeout)
    if (!validHashes.has(input.configHash)) {
      console.log({
        notice: 'Config hash mismatch (new CDK deployment, old runner) - stopping stale warm runner',
        configHash: input.configHash,
        runnerName: input.runnerName,
        validHashes: validHashes,
      });

      try {
        await stopAndDeleteRunner(input, octokit, secrets, 'StaleWarmRunner');
      } catch (e) {
        console.error({
          notice: 'Best-effort cleanup of stale warm runner failed; it will self-terminate at idle timeout',
          configHash: input.configHash,
          runnerName: input.runnerName,
          error: e,
        });
      }
      continue;
    }

    // past deadline - keeper must stop and delete the runner
    if (Date.now() >= input.absoluteDeadline) {
      console.log({
        notice: 'Warm runner past deadline, stopping and deleting',
        configHash: input.configHash,
        runnerName: input.runnerName,
      });
      try {
        await stopAndDeleteRunner(input, octokit, secrets, 'WarmRunnerExpired');
      } catch (e) {
        console.error({
          notice: 'Failed to stop expired warm runner',
          configHash: input.configHash,
          runnerName: input.runnerName,
          error: e,
        });
        // don't retry to not accidentally create a new runner
        // idle reaper will take care of it soon enough
      }
      continue;
    }

    // check if step function is still running
    const execution = await sfn.send(new DescribeExecutionCommand({ executionArn: input.executionArn }));
    const stillRunning = execution.status === 'RUNNING';

    // find runner
    const runner = await getRunner(octokit, secrets.runnerLevel, input.owner, input.repo, input.runnerName);

    // need replacement: step function finished (not running) or runner took a job (busy)
    if (!stillRunning || runner?.busy) {
      console.log({
        notice: 'Warm runner finished or busy; starting replacement',
        configHash: input.configHash,
        runnerName: input.runnerName,
        stillRunning,
        runnerBusy: runner?.busy ?? false,
      });
      try {
        await startWarmRunnerAndEnqueueKeeper({
          providerPath: input.providerPath,
          providerLabels: input.providerLabels,
          owner: input.owner,
          repo: input.repo,
          installationId: input.installationId,
          absoluteDeadline: input.absoluteDeadline,
          configHash: input.configHash,
          executionName: deterministicExecutionName(input.providerPath, record.messageId),
        });
      } catch (e) {
        console.error({
          notice: 'Failed to start replacement warm runner',
          configHash: input.configHash,
          runnerName: input.runnerName,
          error: e,
        });
        retryLater();
      }
      continue;
    }

    // step function still running but runner not found yet
    if (!runner) {
      console.log({
        notice: 'Runner not running yet',
        configHash: input.configHash,
        runnerName: input.runnerName,
      });
      retryLater();
      continue;
    }

    // still idle - check again later
    console.log({
      notice: 'Runner still idle - will check again later',
      configHash: input.configHash,
      runnerName: input.runnerName,
    });
    retryLater();
  }

  return result;
}
