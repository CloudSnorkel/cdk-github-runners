import * as AWSLambda from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { getOctokit, getRunner } from './lambda-github';

interface IdleReaperLambdaInput {
  readonly executionArn: string;
  readonly runnerName: string;
  readonly owner: string;
  readonly repo: string;
  readonly installationId: string;
  readonly maxIdleSeconds: number;
}

const sfn = new AWS.StepFunctions();

exports.handler = async function (event: AWSLambda.SQSEvent): Promise<AWSLambda.SQSBatchResponse> {
  let result: AWSLambda.SQSBatchResponse = { batchItemFailures: [] };

  for (const record of event.Records) {
    const input = JSON.parse(record.body) as IdleReaperLambdaInput;
    console.log(`Checking runner for ${input.owner}/${input.repo} [execution-id=${input.runnerName}]`);

    const retryLater = () => result.batchItemFailures.push({ itemIdentifier: record.messageId });

    // check if step function is still running
    const execution = await sfn.describeExecution({ executionArn: input.executionArn }).promise();
    if (execution.status != 'RUNNING') {
      // no need to test again as runner already finished
      console.log('Runner already finished');
      continue;
    }

    // get github access
    const { octokit } = await getOctokit(input.installationId);

    // find runner
    const runner = await getRunner(octokit, input.owner, input.repo, input.runnerName);
    if (!runner) {
      console.error(`Runner not running yet for ${input.owner}/${input.repo}:${input.runnerName}`);
      retryLater();
      continue;
    }

    // if not idle, we're done
    if (runner.busy) {
      console.log('Runner is not idle');
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

        console.log(`Runner ${input.runnerName} started ${diffMs/1000} seconds ago`);

        if (diffMs > 1000 * input.maxIdleSeconds) {
          // max idle time reached, delete runner
          console.log(`Runner ${input.runnerName} is idle for too long`);

          try {
            // stop step function first, so it's marked as aborted with the proper error
            // if we delete the runner first, the step function will be marked as error with a generic error
            console.log(`Stopping step function ${input.executionArn}...`);
            await sfn.stopExecution({
              executionArn: input.executionArn,
              error: 'IdleRunner',
              cause: `Runner ${input.runnerName} on ${input.owner}/${input.repo} is idle for too long (${diffMs / 1000} seconds and limit is ${input.maxIdleSeconds} seconds)`,
            }).promise();
          } catch (e) {
            console.error(`Failed to stop step function ${input.executionArn}: ${e}`);
            retryLater();
            continue;
          }

          try {
            console.log(`Deleting runner ${runner.id}...`);
            await octokit.rest.actions.deleteSelfHostedRunnerFromRepo({
              owner: input.owner,
              repo: input.repo,
              runner_id: runner.id,
            });
          } catch (e) {
            console.error(`Failed to delete runner ${runner.id}: ${e}`);
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
      console.error('No `cdkghr:started:xxx` label found???');
      retryLater();
    }
  }

  return result;
};
