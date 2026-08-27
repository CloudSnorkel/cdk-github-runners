import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { OrchestratorInput } from './lambda-common';

/**
 * The set of jobs we started a runner for.
 *
 * This is the entire state behind stolen runner detection. One item per job, written before its runner can exist,
 * expiring on its own. Nothing is updated, nothing is counted, and nothing needs cleaning up.
 *
 * A job in here is a job we control. A job that isn't is a job we never agreed to serve, so a runner of ours
 * running it was taken from whoever we did start it for.
 *
 * @internal
 */

const ddb = new DynamoDBClient();

/**
 * Default time-to-live for job records in DynamoDB. GitHub jobs can wait up to 24 hours to get a runner. This adds some margin.
 *
 * If we accidentally provision a runner, that's expensive. Keeping a small record in DynamoDB for a few days is cheaper.
 *
 * @internal
 */
export const DEFAULT_TRACKER_TTL_SECONDS = 3 * 24 * 60 * 60;

/**
 * A runner told us it picked up a job. Sent by the runners themselves, from a job started hook, and read out of
 * their logs. Also sent by the webhook handler for workflow_job.in_progress events.
 *
 * GitHub never tells a runner which job it's running, so this carries the workflow run instead. Combined with the
 * runner name it's enough to ask GitHub for the job id.
 *
 * @internal
 */
export interface RunnerReportMessage {
  readonly kind: 'report';
  readonly runnerName: string;
  readonly repo: string;
  readonly workflowId: number;
  readonly jobId?: number; // comes ONLY from workflow_job.in_progress webhook
}

function tableName(): string {
  const table = process.env.RUNNER_TRACKER_TABLE;
  if (!table) {
    throw new Error('Missing RUNNER_TRACKER_TABLE environment variable');
  }
  return table;
}

function expiry(): number {
  const seconds = parseInt(process.env.RUNNER_TRACKER_TTL_SECONDS ?? `${DEFAULT_TRACKER_TTL_SECONDS}`, 10);
  return Math.floor(Date.now() / 1000) + (isNaN(seconds) ? DEFAULT_TRACKER_TTL_SECONDS : seconds);
}

/**
 * Remember that we started a runner for this job. Written before the step function starts, so it's always there by
 * the time GitHub could possibly hand the runner a job.
 *
 * The extra fields are for whoever is reading the table during an incident. Only the key is ever used. TTL is used for cleanup.
 *
 * @internal
 */
export async function recordControlledJob(input: OrchestratorInput) {
  await ddb.send(new PutItemCommand({
    TableName: tableName(),
    Item: {
      pk: { S: `job#${input.jobId}` },
      jobUrl: { S: input.jobUrl },
      runnerLabels: { S: input.labels },
      ttl: { N: `${expiry()}` },
    },
  }));
}

/**
 * Is this a job we started a runner for?
 *
 * @internal
 */
export async function isControlledJob(jobId: number): Promise<boolean> {
  // consistent, because the job may have been recorded moments ago and reading a stale "no" would look like theft
  const result = await ddb.send(new GetItemCommand({
    TableName: tableName(),
    Key: { pk: { S: `job#${jobId}` } },
    ConsistentRead: true,
  }));

  return !!result.Item;
}
