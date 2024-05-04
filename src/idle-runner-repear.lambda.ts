import { DescribeExecutionCommand, SFNClient, StopExecutionCommand } from '@aws-sdk/client-sfn';
import { Octokit } from '@octokit/rest';
import * as AWSLambda from 'aws-lambda';
import { deleteRunner, getOctokit, getRunner } from './lambda-github';

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
  let octokitCache: Octokit | undefined;
  let runnerLevel: 'repo' | 'org' | undefined;

  for (const record of event.Records) {
    const input = JSON.parse(record.body) as IdleReaperLambdaInput;
    console.log({
      notice: 'Checking runner',
      input,
    });

    const retryLater = () => result.batchItemFailures.push({ itemIdentifier: record.messageId });

    // check if step function is still running
    const execution = await sfn.send(new DescribeExecutionCommand({ executionArn: input.executionArn }));
    if (execution.status != 'RUNNING') {
      // no need to test again as runner already finished
      console.log({
        notice: 'Runner already finished',
        input,
      });
      continue;
    }

    // get github access
    if (!octokitCache) {
      // getOctokit calls secrets manager every time, so cache the result
      const { octokit, githubSecrets } = await getOctokit(input.installationId);
      // TODO if installationId changes during normal operations, we may have some records with good installationId, and some with bad
      octokitCache = octokit;
      runnerLevel = githubSecrets.runnerLevel;
    }

    // find runner
    const runner = await getRunner(octokitCache, runnerLevel, input.owner, input.repo, input.runnerName);
    if (!runner) {
      console.log({
        notice: 'Runner not running yet',
        input,
      });
      retryLater();
      continue;
    }

    // if not idle, try again later
    // we want to try again because the runner might be retried due to e.g. lambda timeout
    // we need to keep following the retry too and make sure it doesn't go idle
    if (runner.busy) {
      console.log({
        notice: 'Runner is not idle',
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
          notice: `Runner ${input.runnerName} started ${diffMs / 1000} seconds ago`,
          input,
        });

        if (diffMs > 1000 * input.maxIdleSeconds) {
          // max idle time reached, delete runner
          console.log({
            notice: `Runner ${input.runnerName} is idle for too long`,
            input,
          });

          try {
            // stop step function first, so it's marked as aborted with the proper error
            // if we delete the runner first, the step function will be marked as failed with a generic error
            console.log({
              notice: `Stopping step function ${input.executionArn}...`,
              input,
            });
            await sfn.send(new StopExecutionCommand({
              executionArn: input.executionArn,
              error: 'IdleRunner',
              cause: `Runner ${input.runnerName} on ${input.owner}/${input.repo} is idle for too long (${diffMs / 1000} seconds and limit is ${input.maxIdleSeconds} seconds)`,
            }));
          } catch (e) {
            console.error({
              notice: `Failed to stop step function ${input.executionArn}: ${e}`,
              input,
            });
            retryLater();
            continue;
          }

          try {
            console.log({
              notice: `Deleting runner ${runner.id}...`,
              input,
            });
            await deleteRunner(octokitCache, runnerLevel, input.owner, input.repo, runner.id);
          } catch (e) {
            console.error({
              notice: `Failed to delete runner ${runner.id}: ${e}`,
              input,
            });
            retryLater();
            continue;
          }
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
        input,
      });
      retryLater();
    }
  }

  return result;
}
