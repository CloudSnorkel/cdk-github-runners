import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

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
 * Default time-to-live for job records.
 *
 * GitHub jobs can stay queued for up to 24 hours and our step function keeps retrying to provision a runner for
 * about that long. A runner started at the very end of that window can then stay idle (warm runners stay up to 24
 * hours) before it picks anything up. Three days covers the worst case with room to spare. DynamoDB only ever
 * deletes items *after* their TTL (up to 48 hours after), never before, so this is a lower bound.
 *
 * @internal
 */
export const DEFAULT_TRACKER_TTL_SECONDS = 3 * 24 * 60 * 60;

/**
 * Input for the runner orchestrator step function. Read back from the step function itself when a runner needs
 * replacing, so it never has to be stored anywhere else.
 *
 * @internal
 */
export interface OrchestratorInput {
  readonly owner: string;
  readonly repo: string;
  readonly jobId: number;
  readonly jobUrl: string;
  readonly installationId: number;
  readonly jobLabels: string;
  readonly provider: string;
  readonly labels: string;
  readonly maxIdleSeconds: number;
}

/**
 * A runner told us it picked up a job. Sent by the runners themselves, from a job started hook, and read out of
 * their logs.
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
}

function tableName(): string {
  const table = process.env.RUNNER_TRACKER_TABLE;
  if (!table) {
    throw new Error('Missing RUNNER_TRACKER_TABLE environment variable');
  }
  return table;
}

/**
 * Is stolen runner detection configured for this function?
 *
 * @internal
 */
export function trackerEnabled(): boolean {
  return !!process.env.RUNNER_TRACKER_TABLE;
}

function expiry(): number {
  const seconds = parseInt(process.env.RUNNER_TRACKER_TTL_SECONDS ?? `${DEFAULT_TRACKER_TTL_SECONDS}`, 10);
  return Math.floor(Date.now() / 1000) + (isNaN(seconds) ? DEFAULT_TRACKER_TTL_SECONDS : seconds);
}

/**
 * Remember that we started a runner for this job. Written before the step function starts, so it's always there by
 * the time GitHub could possibly hand the runner a job.
 *
 * The extra fields are for whoever is reading the table during an incident. Only the key is ever used.
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
