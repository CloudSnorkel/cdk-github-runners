import { DescribeExecutionCommand, ExecutionDoesNotExist, InvalidArn, SFNClient, StopExecutionCommand } from '@aws-sdk/client-sfn';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import * as AWSLambda from 'aws-lambda';
import { OrchestratorInput, WARM_RUNNER_JOB_ID } from './lambda-common';
import { terminateRunnerInstances } from './lambda-ec2';
import { cachedGetOctokit, deleteRunner, getOctokit, getRunner, isNotFound } from './lambda-github';
import { forgetControlledJob, isRunnerAccounted, recordRunnerAccounted } from './lambda-tracker';

interface IdleReaperLambdaInput {
  readonly executionArn: string;
  readonly runnerName: string;
  readonly owner: string;
  readonly repo: string;
  readonly installationId?: number;
  /** how many seconds the runner is allowed to be idle before we reap it */
  readonly maxIdleSeconds: number;
  /** id of the runner we first saw idle, so a retried runner with the same name doesn't inherit its idle time */
  readonly runnerId?: number;
  /** when we first saw that runner idle, in milliseconds since epoch */
  readonly idleSince?: number;
}

const sfn = new SFNClient();
const sqs = new SQSClient();

/**
 * How many runners we follow before giving up on finding the job left without a runner. Every hop is a handful of API calls, so a full
 * batch of runners walking this far still finishes well within the timeout.
 */
const MAX_HOPS = 10;

/**
 * Input of the step function that started a runner, or undefined if the runner isn't ours.
 */
async function runnerInput(executionArn: string): Promise<unknown> {
  try {
    const execution = await sfn.send(new DescribeExecutionCommand({ executionArn }));
    return execution.input ? JSON.parse(execution.input) : undefined;
  } catch (e) {
    if (e instanceof ExecutionDoesNotExist || e instanceof InvalidArn) {
      // somebody else's runner
      return undefined;
    }
    throw e;
  }
}

/**
 * Find the job left without a runner now that we're reaping this one.
 *
 * That's usually the job this runner was started for. But GitHub may have handed that job to another runner of ours, which leaves the job that
 * runner was started for waiting instead. That job may have been handed to yet another runner of ours, and so on. We follow the chain until we
 * find a job still waiting for a runner.
 *
 * Returns undefined when no job was left without a runner, or when we can't tell.
 */
async function findAbandonedJob(octokitCache: typeof getOctokit, executionArn: string, input: unknown): Promise<number | undefined> {
  const seen = new Set<number>();
  let current = input;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const { owner, repo, jobId, installationId } = (current ?? {}) as Partial<OrchestratorInput>;
    if (typeof owner != 'string' || typeof repo != 'string' || typeof jobId != 'number') {
      // step function started by hand with input we don't understand
      console.log({ notice: 'Runner has no job we understand', input: current });
      return undefined;
    }
    if (jobId == WARM_RUNNER_JOB_ID) {
      // warm runners aren't started for any job, so no job is waiting on them
      return undefined;
    }
    if (seen.has(jobId)) {
      // the jobs got shuffled between our runners and we came back around. they all ran, so nothing was abandoned
      return undefined;
    }
    seen.add(jobId);

    let job;
    try {
      const { octokit } = await octokitCache(installationId);
      job = (await octokit.rest.actions.getJobForWorkflowRun({ owner, repo, job_id: jobId })).data;
    } catch (e) {
      if (!isNotFound(e)) {
        throw e;
      }
      // step function started by hand with a job that doesn't exist
      console.log({ notice: 'GitHub knows nothing about this job', owner, repo, jobId });
      return undefined;
    }

    if (!job.runner_name) {
      // never assigned. still waiting means it's the one left without a runner. completed means it was cancelled before any runner got it.
      return job.status == 'completed' ? undefined : jobId;
    }

    // the job got a runner. if that runner is ours, the job it was started for is the one left waiting now. runner names are execution names.
    current = await runnerInput(executionArn.replace(/[^:]+$/, job.runner_name));
    if (current === undefined) {
      // not our runner, so none of our jobs is waiting on it
      return undefined;
    }
    if ((current as Partial<OrchestratorInput>).jobId == jobId) {
      // it ran on a runner started for it (e.g. a duplicate execution or a replacement), so nothing is waiting
      return undefined;
    }
  }

  console.log({ notice: 'Gave up looking for the job left without a runner', executionArn, hops: MAX_HOPS });
  return undefined;
}

/**
 * This runner is gone. If it never reported a job, forget the job left without a runner because of it.
 *
 * That job may be stuck on GitHub's side (e.g. outage) and get handed to another runner of ours later on. Forgetting it means that runner is
 * detected as stolen and replaced, instead of looking like a fair shuffle. If the job ends up with another runner of ours anyway, we may get a
 * false positive and start one runner too many. That runner will just idle until it's reaped too, which is better than leaving a job with no
 * runner at all.
 *
 * Returns false if we should try again later.
 */
async function runnerGone(octokitCache: typeof getOctokit, input: IdleReaperLambdaInput, executionInput?: string): Promise<boolean> {
  if (executionInput === undefined) {
    console.warn({
      notice: 'Bad execution input',
      input,
    });
    return true;
  }

  try {
    if (await isRunnerAccounted(input.runnerName)) {
      // it reported a job, or we already got here before
      return true;
    }

    // no report doesn't prove it ran nothing (e.g. a quick job that ended before its report was handled), but the walk asks GitHub anyway
    const jobId = await findAbandonedJob(octokitCache, input.executionArn, JSON.parse(executionInput));
    if (jobId !== undefined) {
      console.log({
        notice: 'Forgetting job left without a runner',
        jobId,
        runnerName: input.runnerName,
        input,
      });
      await forgetControlledJob(jobId);
    }

    // mark the runner as accounted for so we don't try to forget its job again later
    // there are a few paths that lead to this function, and we don't want to do this whole process twice...
    await recordRunnerAccounted(input.runnerName);
    return true;
  } catch (e) {
    console.error({
      notice: 'Failed to forget job',
      runnerName: input.runnerName,
      error: e,
      input,
    });
    return false;
  }
}

export async function handler(event: AWSLambda.SQSEvent): Promise<AWSLambda.SQSBatchResponse> {
  const result: AWSLambda.SQSBatchResponse = { batchItemFailures: [] };
  const getOctokitCached = cachedGetOctokit();

  for (const record of event.Records) {
    const input = JSON.parse(record.body) as IdleReaperLambdaInput;
    console.log({
      notice: 'Checking runner',
      runnerName: input.runnerName,
      input,
    });

    const retryLater = () => result.batchItemFailures.push({ itemIdentifier: record.messageId });

    // check if step function is still running
    const execution = await sfn.send(new DescribeExecutionCommand({ executionArn: input.executionArn }));
    if (execution.status == 'SUCCEEDED') {
      // no need to test again as runner already finished and removed itself
      console.log({
        notice: 'Runner already finished',
        runnerName: input.runnerName,
        input,
      });
      // the runner reported success, so any instance still running for it has outlived its job. that can happen when `poweroff` doesn't work for any
      // reason. generally in rare cases, but we don't want to leave expensive instances behind.
      await terminateRunnerInstances(input.runnerName);
      // success doesn't mean it ran a job (e.g. somebody deleted the runner while it was idle)
      if (!await runnerGone(getOctokitCached, input, execution.input)) {
        retryLater();
      }
      continue;
    }

    // a step function that ended any other way may not have cleaned up after itself. that happens when it's stopped
    // from the outside, or when Step Functions kills it for reaching its 25,000 event history limit. its runner can
    // still be registered and can still pick up a job, so we keep watching it like any other runner and let the idle
    // timeout decide. we just have no step function left to stop when that time comes.
    const executionStopped = execution.status != 'RUNNING';

    // get github access
    const { octokit, githubSecrets: secrets } = await getOctokitCached(input.installationId);

    // find runner
    const runner = await getRunner(octokit, secrets.runnerLevel, input.owner, input.repo, input.runnerName);
    if (!runner) {
      if (executionStopped) {
        console.log({
          notice: 'Stopped step function has no runner to clean up',
          runnerName: input.runnerName,
          input,
        });
        // no runner on GitHub, terminate any instance that didn't properly power-off due to some extreme failure (e.g. IMDS failure, OOM killer,
        // wedged poweroff, etc.). the step function is stopped, so it won't be able to clean up after itself.
        await terminateRunnerInstances(input.runnerName);
        // the step function may have failed before its runner ever registered, so its job may still be waiting for one
        if (!await runnerGone(getOctokitCached, input, execution.input)) {
          retryLater();
        }
        continue;
      }

      console.log({
        notice: 'Runner not running yet',
        runnerName: input.runnerName,
        input,
      });
      retryLater();
      continue;
    }

    // if not idle, try again later
    // we want to try again because the runner might be retried due to e.g. lambda timeout
    // we need to keep following the retry too and make sure it doesn't go idle
    if (runner.busy) {
      if (executionStopped) {
        // it took a job, so it will remove itself once it's done, like every other ephemeral runner
        console.log({
          notice: 'Stopped step function left a busy runner behind',
          runnerId: runner.id,
          runnerName: input.runnerName,
          input,
        });
        retryLater(); // we still want the opportunity to clean up the instance if the runner doesn't remove itself for some reason, so we retry later
        continue;
      }

      console.log({
        notice: 'Runner is not idle',
        runnerId: runner.id,
        runnerName: input.runnerName,
        input,
      });
      retryLater();
      continue;
    }

    // JIT runners are registered before they boot, so an offline runner is usually one that is still starting. some providers can take more than
    // ten minutes to get there. once the step function is gone, nothing is going to start it, so we treat it as idle and let the timeout decide.
    if (runner.status !== 'online' && !executionStopped) {
      console.log({
        notice: 'Runner not online yet',
        runnerId: runner.id,
        runnerName: input.runnerName,
        input,
      });
      retryLater();
      continue;
    }

    // the first time we see the runner idle, we start the clock with a new message that remembers which runner we saw. a retried runner
    // registers again with a new id, so it starts the clock over.
    if (input.runnerId !== runner.id || input.idleSince === undefined) {
      console.log({
        notice: 'Runner is idle',
        runnerId: runner.id,
        runnerName: input.runnerName,
        input,
      });
      try {
        await sqs.send(new SendMessageCommand({
          QueueUrl: process.env.IDLE_REAPER_QUEUE_URL,
          MessageBody: JSON.stringify(<IdleReaperLambdaInput>{ ...input, runnerId: runner.id, idleSince: Date.now() }),
        }));
      } catch (e) {
        console.error({
          notice: 'Failed to enqueue idle check',
          runnerId: runner.id,
          runnerName: input.runnerName,
          error: e,
          input,
        });
        retryLater();
      }
      continue;
    }

    // check if max idle timeout has reached
    const idleMs = Date.now() - input.idleSince;
    console.log({
      notice: 'Runner is still idle',
      runnerId: runner.id,
      runnerName: input.runnerName,
      idleSeconds: idleMs / 1000,
      input,
    });

    if (idleMs < 1000 * input.maxIdleSeconds) {
      // still idle, timeout not reached - retry later
      retryLater();
      continue;
    }

    // max idle time reached, delete runner
    console.log({
      notice: 'Runner is idle for too long',
      runnerId: runner.id,
      runnerName: input.runnerName,
      idleSeconds: idleMs / 1000,
      maxIdleSeconds: input.maxIdleSeconds,
      input,
    });

    // nothing to stop when it already stopped on its own
    if (!executionStopped) {
      try {
        // stop step function first, so it's marked as aborted with the proper error
        // if we delete the runner first, the step function will be marked as failed with a generic error
        console.log({
          notice: 'Stopping step function',
          executionArn: input.executionArn,
          runnerId: runner.id,
          runnerName: input.runnerName,
          input,
        });
        await sfn.send(new StopExecutionCommand({
          executionArn: input.executionArn,
          error: 'IdleRunner',
          cause: `Runner ${input.runnerName} on ${input.owner}/${input.repo} is idle for too long (${idleMs / 1000} seconds and limit is ${input.maxIdleSeconds} seconds)`,
        }));
        console.log({
          notice: 'Stopped step function',
          metric: 'RunnerStopped',
          reason: 'IdleRunner',
          executionArn: input.executionArn,
          runnerName: input.runnerName,
          owner: input.owner,
          repo: input.repo,
        });
      } catch (e) {
        console.error({
          notice: 'Failed to stop step function',
          executionArn: input.executionArn,
          runnerId: runner.id,
          runnerName: input.runnerName,
          error: e,
          input,
        });
        retryLater();
        continue;
      }
    }

    try {
      console.log({
        notice: 'Deleting runner',
        runnerId: runner.id,
        runnerName: input.runnerName,
        input,
      });
      await deleteRunner(octokit, secrets.runnerLevel, input.owner, input.repo, runner.id);
    } catch (e) {
      console.error({
        notice: 'Failed to delete runner',
        runnerId: runner.id,
        runnerName: input.runnerName,
        error: e,
        input,
      });
      retryLater();
      continue;
    }

    // GitHub only lets us delete an idle runner, so this one never got a job. account for it now so its job is forgotten right away and not on
    // the next delivery about 10 minutes from now. The message is retried below either way, so if this fails, the "no runner" branch above
    // tries again.
    await runnerGone(getOctokitCached, input, execution.input);

    // the runner is deleted but the instance is still alive and about to notice. do not terminate. give it a delivery cycle to log why it's
    // stopping and power itself off. if it's still here next time, the !runner branch above terminates it
    retryLater();
  }

  return result;
}
