import { DescribeExecutionCommand, SFNClient, StopExecutionCommand } from '@aws-sdk/client-sfn';
import type { Octokit } from '@octokit/rest' with { 'resolution-mode': 'import' };
import * as AWSLambda from 'aws-lambda';
import { terminateRunnerInstances } from './lambda-ec2';
import { deleteRunner, getOctokit, getRunner, GitHubSecrets } from './lambda-github';

interface IdleReaperLambdaInput {
  readonly executionArn: string;
  readonly runnerName: string;
  readonly owner: string;
  readonly repo: string;
  readonly installationId?: number;
  readonly maxIdleSeconds: number;
}

const sfn = new SFNClient();

export async function handler(event: AWSLambda.SQSEvent): Promise<AWSLambda.SQSBatchResponse> {
  const result: AWSLambda.SQSBatchResponse = { batchItemFailures: [] };
  const octokitCache = new Map<number | undefined, { octokit: Octokit; secrets: GitHubSecrets }>();

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
      continue;
    }

    // a step function that ended any other way may not have cleaned up after itself. that happens when it's stopped
    // from the outside, or when Step Functions kills it for reaching its 25,000 event history limit. its runner can
    // still be registered and can still pick up a job, so we keep watching it like any other runner and let the idle
    // timeout decide. we just have no step function left to stop when that time comes.
    const executionStopped = execution.status != 'RUNNING';

    // get github access
    let octokit: Octokit;
    let secrets: GitHubSecrets;
    const cached = octokitCache.get(input.installationId);
    if (cached) {
      // use cached octokit
      octokit = cached.octokit;
      secrets = cached.secrets;
    } else {
      // getOctokit calls secrets manager and Github API every time, so cache the result
      // this handler can work on multiple runners at once, so caching is important
      const { octokit: newOctokit, githubSecrets: newSecrets } = await getOctokit(input.installationId);
      octokit = newOctokit;
      secrets = newSecrets;
      octokitCache.set(input.installationId, { octokit, secrets });
    }

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

    // check if max idle timeout has reached
    let found = false;
    for (const label of runner.labels) {
      if (label.name.toLowerCase().startsWith('cdkghr:started:')) {
        const started = parseFloat(label.name.split(':')[2]);
        const startedDate = new Date(started * 1000);
        const now = new Date();
        const diffMs = now.getTime() - startedDate.getTime();

        console.log({
          notice: 'Runner is idle',
          runnerId: runner.id,
          runnerName: input.runnerName,
          idleSeconds: diffMs / 1000,
          input,
        });

        if (diffMs > 1000 * input.maxIdleSeconds) {
          // max idle time reached, delete runner
          console.log({
            notice: 'Runner is idle for too long',
            runnerId: runner.id,
            runnerName: input.runnerName,
            idleSeconds: diffMs / 1000,
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
                cause: `Runner ${input.runnerName} on ${input.owner}/${input.repo} is idle for too long (${diffMs / 1000} seconds and limit is ${input.maxIdleSeconds} seconds)`,
              }));
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

          // the runner is deleted but the instance is still alive and about to notice. do not terminate. give it a delivery cycle to log why it's
          // stopping and power itself off. if it's still here next time, the !runner branch above terminates it
          retryLater();
        } else {
          // still idle, timeout not reached -- retry later
          retryLater();
        }

        found = true;
        break;
      }
    }

    if (!found) {
      // no started label? retry later (it won't retry forever as eventually the runner will stop and the step function will finish)
      console.error({
        notice: 'No `cdkghr:started:xxx` label found???',
        runnerId: runner.id,
        runnerName: input.runnerName,
        input,
      });
      retryLater();
    }
  }

  return result;
}
