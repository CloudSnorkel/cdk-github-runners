import * as zlib from 'zlib';
import {
  DescribeExecutionCommand,
  ExecutionAlreadyExists,
  ExecutionDoesNotExist,
  SFNClient,
  StartExecutionCommand,
} from '@aws-sdk/client-sfn';
import { SendMessageBatchCommand, SQSClient } from '@aws-sdk/client-sqs';
import * as AWSLambda from 'aws-lambda';
import { getOctokit } from './lambda-github';
import { isControlledJob, OrchestratorInput, RunnerReportMessage } from './lambda-tracker';
import { WARM_RUNNER_JOB_ID } from './warm-runner-manager.lambda';

const sfn = new SFNClient();
const sqs = new SQSClient();

/**
 * @internal
 */
export function replacementRunnerName(stolenRunnerName: string): string {
  const match = stolenRunnerName.match(/^(.*)-r(\d+)$/);
  const base = match ? match[1] : stolenRunnerName;
  const attempt = match ? parseInt(match[2], 10) + 1 : 1;
  const suffix = `-r${attempt}`;

  return `${base.slice(0, 64 - suffix.length)}${suffix}`;
}

function executionArn(runnerName: string): string {
  const stateMachineArn = process.env.STEP_FUNCTION_ARN;
  if (!stateMachineArn) {
    throw new Error('Missing STEP_FUNCTION_ARN environment variable');
  }

  return `${stateMachineArn.replace(':stateMachine:', ':execution:')}:${runnerName}`;
}

async function findRunnerInput(runnerName: string): Promise<OrchestratorInput | undefined> {
  try {
    const execution = await sfn.send(new DescribeExecutionCommand({ executionArn: executionArn(runnerName) }));
    return execution.input ? JSON.parse(execution.input) as OrchestratorInput : undefined;
  } catch (e) {
    if (e instanceof ExecutionDoesNotExist) {
      // somebody else's runner, or one from before this was deployed
      return undefined;
    }
    throw e;
  }
}

/**
 * Get job id from report that only contains runner name, repo, and workflow run id.
 * We list all jobs for the workflow and look for a matching runner name.
 *
 * GitHub doesn't have a better API for this. It also doesn't expose job id to the job.
 */
async function jobIdFromRunner(report: RunnerReportMessage, installationId: number): Promise<number | undefined> {
  const [owner, repo] = report.repo.split('/');
  if (!owner || !repo) {
    console.warn({ notice: 'Runner reported a repository we cannot parse', report });
    return undefined;
  }

  const { octokit } = await getOctokit(installationId > 0 ? installationId : undefined);

  const jobs = await octokit.paginate(octokit.rest.actions.listJobsForWorkflowRun, {
    owner,
    repo,
    run_id: report.workflowId,
    filter: 'all', // all workflow attempts
    per_page: 100,
  });

  const job = jobs.find(j => j.runner_name === report.runnerName);
  if (!job) {
    console.warn({
      notice: 'No job in this run attempt ran on this runner',
      report,
      jobs: jobs.length,
    });
    return undefined;
  }

  return job.id;
}

/**
 * Start another runner just like the one that was taken.
 */
async function replaceRunner(stolenRunnerName: string, input: OrchestratorInput, thiefJobId: number) {
  // TODO do not replace more than 3 times
  const runnerName = replacementRunnerName(stolenRunnerName);

  try {
    await sfn.send(new StartExecutionCommand({
      stateMachineArn: process.env.STEP_FUNCTION_ARN,
      name: runnerName,
      input: JSON.stringify(input),
    }));
  } catch (e) {
    if (e instanceof ExecutionAlreadyExists) {
      // we already heard about this theft
      console.log({ notice: 'Replacement runner already started', stolenRunnerName, runnerName });
      return;
    }
    throw e;
  }

  console.warn({
    notice: 'Runner was stolen, started another one',
    metric: 'StolenRunnerDetected',
    stolenRunnerName,
    runnerName,
    stolenByJobId: thiefJobId,
    jobId: input.jobId,
    jobUrl: input.jobUrl,
    owner: input.owner,
    repo: input.repo,
    provider: input.provider,
  });
}

/**
 * Check if runner was stolen and possibly replace it.
 */
async function handleRunnerReport(report: RunnerReportMessage) {
  const input = await findRunnerInput(report.runnerName);
  if (!input) {
    return;
  }

  if (input.jobId == WARM_RUNNER_JOB_ID) {
    // warm runners aren't started for any job in particular, so nothing they run is stolen
    // warm runner keeper starts a replacement on its own as soon as it sees one go busy
    console.log({
      notice: 'Warm runner taken',
      metric: 'WarmRunnerTaken',
      runnerName: report.runnerName,
      repo: report.repo,
      runId: report.workflowId,
    });
    return;
  }

  // TODO this might be wrong... after all, it was taken by possibly a different installation
  const jobId = await jobIdFromRunner(report, input.installationId);

  if (jobId === input.jobId) {
    // ran the job it was started for, which is the whole point
    return;
  }

  if (jobId !== undefined && await isControlledJob(jobId)) {
    // GitHub shuffled jobs between runners we started
    // every job involved has a runner, so no job is left hanging
    console.log({
      notice: 'Runner ran another job of ours',
      runnerName: report.runnerName,
      jobId,
      expectedJobId: input.jobId,
    });
    return;
  }

  // runner ran a job we never started a runner for
  // runner was stolen, start another one just like it
  await replaceRunner(report.runnerName, input, jobId ?? -1);
}

/**
 * Send log messages to SQS so we can delay and batch them. This helps make sure we process them *after* the webhook arrives and writes to DDB.
 */
async function handleRunnerLogs(event: AWSLambda.CloudWatchLogsEvent) {
  const queueUrl = process.env.JOB_ASSIGNMENT_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('Missing JOB_ASSIGNMENT_QUEUE_URL environment variable');
  }

  const payload = JSON.parse(zlib.gunzipSync(Buffer.from(event.awslogs.data, 'base64')).toString('utf8')) as AWSLambda.CloudWatchLogsDecodedData;

  const messages: RunnerReportMessage[] = [];
  for (const logEvent of payload.logEvents) {
    const message = parseRunnerReport(logEvent.message);
    if (message) {
      messages.push(message);
    } else {
      console.warn({
        notice: 'Unparsable runner report',
        logGroup: payload.logGroup,
        logStream: payload.logStream,
        message: logEvent.message,
      });
    }
  }

  // batches of ten, which is both the SQS limit and more reports than one log delivery should ever carry
  for (let i = 0; i < messages.length; i += 10) {
    const batch = messages.slice(i, i + 10);
    await sqs.send(new SendMessageBatchCommand({
      QueueUrl: queueUrl,
      Entries: batch.map((message, index) => ({
        Id: `${i + index}`,
        MessageBody: JSON.stringify(message),
      })),
    }));
  }

  console.log({
    notice: 'Queued runner reports',
    logGroup: payload.logGroup,
    count: messages.length,
  });
}

/**
 * @internal
 */
export function parseRunnerReport(line: string): RunnerReportMessage | undefined {
  // this data can't be fully trusted as the jobs themselves can run untrusted code... but:
  //   1. the untrusted code has access to just one runner name
  //   2. the new runner we will start will have a specific name and step functions will reject duplicate names
  // so malicious code shouldn't be able to trick us into starting too many runners
  // TODO still might want to dedup on logStream (while handling Lambda reusing log streams) to avoid the extra work and gh/aws api calls
  const match = line.match(/CDKGHR JOB RUNNER=(\S+) REPO=(\S+) WORKFLOW_ID=(\d+)/);
  if (!match) {
    return undefined;
  }

  return {
    kind: 'report',
    runnerName: match[1],
    repo: match[2],
    workflowId: parseInt(match[3], 10),
  };
}

function isCloudWatchLogsEvent(event: unknown): event is AWSLambda.CloudWatchLogsEvent {
  return typeof (event as AWSLambda.CloudWatchLogsEvent)?.awslogs?.data === 'string';
}

export async function handler(event: AWSLambda.SQSEvent | AWSLambda.CloudWatchLogsEvent): Promise<AWSLambda.SQSBatchResponse | void> {
  if (isCloudWatchLogsEvent(event)) {
    // let this throw. CloudWatch Logs retries the delivery, and a lost report is a missed stolen runner.
    return handleRunnerLogs(event);
  }

  const result: AWSLambda.SQSBatchResponse = { batchItemFailures: [] };

  for (const record of event.Records) {
    let report: RunnerReportMessage;
    try {
      report = JSON.parse(record.body) as RunnerReportMessage;
    } catch (e) {
      console.error({
        notice: 'Failed to parse message body',
        messageId: record.messageId,
        error: `${e}`,
      });
      continue;
    }

    try {
      await handleRunnerReport(report);
    } catch (e) {
      console.error({
        notice: 'Failed to process runner report',
        messageId: record.messageId,
        report,
        error: `${e}`,
      });
      result.batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return result;
}
