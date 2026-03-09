/**
 * Warm Runner Manager Lambda
 *
 * Maintains a pool of pre-provisioned ("warm") GitHub self-hosted runners so jobs
 * start with near-zero latency instead of waiting for a fresh runner to provision.
 *
 * ## Lifecycle
 *
 * 1. **Fill** — An EventBridge cron rule (midnight UTC for always-on, or window
 *    start for scheduled) sends a fill payload to the shared SQS queue. A
 *    CloudFormation custom resource (on deploy) invokes this Lambda directly.
 *    Both paths start `count` Step Function executions and enqueue one keeper
 *    message per runner. Using SQS for EventBridge fills gives stable messageId
 *    for idempotent retries (Lambda timeout mid-fill → no duplicate runners).
 *
 * 2. **Keeper** — Each keeper message tracks one runner. The SQS queue delivers the
 *    message, this Lambda inspects the runner, and one of the following happens:
 *    - Runner is idle and within deadline → message is returned to the queue
 *      (via batch item failure) to be checked again after the visibility timeout.
 *    - Runner is busy or its Step Function finished → a replacement runner is
 *      started with the same deadline, and a new keeper message is enqueued.
 *    - Runner is past its deadline → the Step Function is stopped and the GitHub
 *      runner is deleted. No replacement is created.
 *    - Config hash mismatch (config was changed/removed since this runner was
 *      created) → the runner is stopped and deleted. No replacement is created.
 *      This is how old runners are cleaned up quickly on config changes.
 *
 * 3. **Natural expiry** — Each runner's Step Function is started with a
 *    `maxIdleSeconds` equal to the remaining time until its deadline. If the
 *    keeper somehow fails to stop it, the runner will self-terminate when the
 *    Step Function's idle timeout fires. This is a safety net, not the primary
 *    shutdown mechanism.
 *
 * ## Config hash
 *
 * Each warm runner config (provider, count, labels, owner, repo, idle timeout) is
 * hashed at CDK synth time. All current hashes are stored in the WARM_CONFIG_HASHES
 * environment variable. Fill payloads and keeper messages carry the hash. When the
 * keeper processes a message whose hash is not in the current set, it knows the
 * config was changed or removed and stops the runner immediately. This minimizes
 * over-provisioning on config changes to the time it takes SQS to redeliver the
 * keeper messages (visibility timeout, typically ~1 minute).
 *
 * ## Gotchas
 *
 * - The SQS queue is shared across ALL warm runner configs. Queue depth is not a
 *   reliable indicator of per-config runner count.
 * - Keeper messages rely on SQS redelivery (batch item failure) for periodic
 *   checking. The visibility timeout (1 min) determines how often runners are
 *   polled. Failed messages are retried until they succeed or the runner
 *   self-terminates at its idle timeout.
 * - Each fill unconditionally starts `count` runners — it does not check how many
 *   are already running. On cron fire, this creates a brief overlap with the
 *   previous cycle's runners (which are near their deadline).
 * - Removing a warm runner construct from CDK does not immediately stop its
 *   runners. The config hash is removed from the env var on deploy, so keepers
 *   will stop them on next processing, but until then runners persist. For
 *   immediate cleanup, set count to 0 and deploy before removing the construct.
 * - **Gaps in coverage**: The Step Function that provisions each warm runner uses
 *   increasing timeouts between retries for provider failures (CodeBuild timeout,
 *   Lambda timeout, capacity errors, etc.). While a warm runner slot is retrying,
 *   that slot has no runner — creating gaps in coverage. An idle warm runner that
 *   fails to provision (or whose replacement fails) will be unavailable until the
 *   retry succeeds. This behavior will be improved in a future release.
 */
import * as crypto from 'crypto';
import {
  DescribeExecutionCommand,
  SFNClient,
  StartExecutionCommand,
  StopExecutionCommand,
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

async function resolveInstallationId(owner: string, repo: string) {
  const appOctokit = await getAppOctokit();
  if (!appOctokit) {
    return undefined; // PAT authentication — no installation ID needed
  }

  if (repo) {
    const { data } = await appOctokit.rest.apps.getRepoInstallation({ owner, repo });
    return data.id;
  } else {
    const { data } = await appOctokit.rest.apps.getOrgInstallation({ org: owner });
    return data.id;
  }
}

async function startWarmRunnerAndEnqueueKeeper(input: StartWarmRunnerInput) {
  const stepFunctionArn = requireEnv('STEP_FUNCTION_ARN');
  const queueUrl = requireEnv('WARM_RUNNER_QUEUE_URL');

  const remainingSeconds = Math.floor((input.absoluteDeadline - Date.now()) / 1000);
  if (remainingSeconds <= 0) {
    console.log({
      notice: 'Absolute deadline already passed; not starting replacement',
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
        labels: input.providerLabels.join(','),
        maxIdleSeconds: remainingSeconds,
      }),
    }));
    executionArn = result.executionArn!;
  } catch (e: unknown) {
    if ((e as { name?: string }).name === 'ExecutionAlreadyExists') {
      // Idempotent retry: execution was already started (e.g. Lambda timed out mid-fill).
      // Don't enqueue — the first attempt already did; duplicate keeper messages would cause duplicate replacements.
      console.log({
        notice: 'ExecutionAlreadyExists — idempotent retry, skipping enqueue',
        executionName: input.executionName,
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
    runnerName: input.executionName,
    executionArn,
    remainingSeconds,
  });
}

/**
 * Unconditionally starts `count` warm runners for the given config and enqueues keeper messages.
 *
 * We intentionally do NOT check current queue depth or existing runner count. SQS queue depth
 * metrics (ApproximateNumberOfMessages) are unreliable and the queue is shared across all warm
 * runner configs, making per-config depth meaningless.
 *
 * Each fill creates a fresh batch. Old runners from a previous config are cleaned up quickly:
 * their keeper messages carry the old configHash, which won't match the current
 * WARM_CONFIG_HASHES env var — the keeper discards stale messages and stops those runners.
 * For normal cron rotation (same config), the old runners reach their deadline and are stopped
 * by the keeper as usual, causing only a brief overlap (typically minutes).
 */
async function runFiller(input: WarmRunnerFillPayload, getNameForSlot: (slot: number) => string) {
  const installationId = await resolveInstallationId(input.owner, input.repo);
  const absoluteDeadline = Date.now() + input.duration * 1000;

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
    });
  }

  console.log({
    notice: 'Fill complete — started warm runners',
    providerPath: input.providerPath,
    started: input.count,
  });
}

async function stopAndDeleteRunner(input: WarmRunnerKeeperMessage, octokit: Octokit, secrets: GitHubSecrets) {
  try {
    await sfn.send(new StopExecutionCommand({
      executionArn: input.executionArn,
      error: 'WarmRunnerExpired',
      cause: `Warm runner ${input.runnerName} stopped by keeper`,
    }));
  } catch (e) {
    console.error({
      notice: `Failed to stop step function ${input.executionArn}: ${e}`,
      input,
    });
  }

  const runner = await getRunner(octokit, secrets.runnerLevel, input.owner, input.repo, input.runnerName);
  if (runner) {
    try {
      await deleteRunner(octokit, secrets.runnerLevel, input.owner, input.repo, runner.id);
    } catch (e) {
      console.error({
        notice: `Failed to delete runner ${runner.id}: ${e}`,
        input,
      });
    }
  }
}

/**
 * Warm runner manager Lambda — handles three invocation modes:
 *
 * 1. **CloudFormation Custom Resource** (`RequestType` + `ResponseURL` present):
 *    Triggered on stack deploy (Create/Update). Extracts the fill payload from
 *    `ResourceProperties` and runs `runFiller` to start warm runners immediately.
 *    Delete is a no-op (runners wind down via keeper or deadline).
 *
 * 2. **SQS messages** (fill or keeper):
 *    - **Fill** (body has `action: 'fill'`): from EventBridge cron. Uses messageId
 *      for deterministic execution names (idempotent on redelivery).
 *    - **Keeper**: tracks one runner. Uses SQS message cycling for periodic checks.
 *    Each message tracks one warm runner. The keeper checks:
 *    - **Config hash**: if the message's `configHash` doesn't match the current
 *      `WARM_CONFIG_HASHES` env var, the runner is from a stale config — stop it
 *      and discard the message without replacement.
 *    - **Busy/finished**: if the Step Function ended or the GitHub runner is busy,
 *      start a replacement runner (inheriting the same deadline and config hash).
 *    - **Not registered yet**: retry later (message goes back to queue).
 *    - **Past deadline**: stop the Step Function and delete the GitHub runner.
 *    - **Idle and within deadline**: retry later to check again.
 */
export async function handler(event: AWSLambda.SQSEvent | AWSLambda.CloudFormationCustomResourceEvent) {
  if (isCustomResourceEvent(event)) {
    const physicalId = ('PhysicalResourceId' in event ? event.PhysicalResourceId : undefined) ?? event.LogicalResourceId;
    try {
      if (event.RequestType === 'Create' || event.RequestType === 'Update') {
        const props = event.ResourceProperties as unknown as WarmRunnerFillPayload;
        // LogicalResourceId + RequestType + configHash are stable across CloudFormation retries.
        // RequestId changes per retry, so we don't use it.
        const getNameForSlot = (slot: number) =>
          deterministicExecutionName(props.providerPath, `${event.LogicalResourceId}:${event.RequestType}:${props.configHash}:${slot}`);
        await runFiller(props, getNameForSlot);
      }
      await customResourceRespond(event, 'SUCCESS', 'OK', physicalId, {});
    } catch (e) {
      console.error({ notice: 'Custom resource handler failed' });
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
    const body = JSON.parse(record.body) as WarmRunnerKeeperMessage | WarmRunnerFillPayload;

    // Fill from EventBridge (via SQS): messageId is stable across redeliveries.
    if (isFillInput(body)) {
      try {
        const getNameForSlot = (slot: number) =>
          deterministicExecutionName(body.providerPath, `${record.messageId}:${slot}`);
        await runFiller(body, getNameForSlot);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error({ notice: 'Fill failed', requestId: record.messageId, errorMessage });
        result.batchItemFailures.push({ itemIdentifier: record.messageId });
      }
      continue;
    }

    // Keeper message
    const input = body as WarmRunnerKeeperMessage;
    console.log({
      notice: 'Checking warm runner',
      input,
    });

    const retryLater = () => result.batchItemFailures.push({ itemIdentifier: record.messageId });

    // get github access (cached per installationId)
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

    // stale config — best-effort stop, then discard message (runner will self-terminate at its idle timeout)
    if (input.configHash && !validHashes.has(input.configHash)) {
      console.log({
        notice: 'Config hash mismatch — stopping stale warm runner',
        messageHash: input.configHash,
        validHashes: [...validHashes],
      });

      try {
        await stopAndDeleteRunner(input, octokit, secrets);
      } catch (e) {
        console.error({ notice: 'Best-effort cleanup of stale warm runner failed; it will self-terminate at idle timeout', input, error: `${e}` });
      }
      continue;
    }

    // check if step function is still running
    const execution = await sfn.send(new DescribeExecutionCommand({ executionArn: input.executionArn }));
    const stillRunning = execution.status === 'RUNNING';

    // find runner
    const runner = await getRunner(octokit, secrets.runnerLevel, input.owner, input.repo, input.runnerName);

    // need replacement: execution finished (not running) or runner took a job (busy)
    if (!stillRunning || runner?.busy) {
      console.log({
        notice: 'Warm runner finished or busy; starting replacement',
        input,
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
          input,
          error: e,
        });
        retryLater();
      }
      continue;
    }

    // execution still running and runner not found yet
    if (!runner) {
      console.log({
        notice: 'Runner not running yet',
        input,
      });
      retryLater();
      continue;
    }

    // runner exists and not busy — check expiry
    if (Date.now() >= input.absoluteDeadline) {
      console.log({
        notice: 'Warm runner past deadline, stopping and deleting',
        input,
      });

      await stopAndDeleteRunner(input, octokit, secrets);
      continue;
    }

    // still idle and within deadline — check again later
    retryLater();
  }

  return result;
}
