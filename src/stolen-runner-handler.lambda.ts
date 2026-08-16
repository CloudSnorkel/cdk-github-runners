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
import { MAX_RUNNER_NAME_LENGTH, WARM_RUNNER_JOB_ID } from './lambda-consts';
import { getOctokit, isNotFound, resolveInstallationId } from './lambda-github';
import { isControlledJob, OrchestratorInput, RunnerReportMessage } from './lambda-tracker';

const sfn = new SFNClient();
const sqs = new SQSClient();

/**
 * Limit the amount of times we try to replace a stolen runner. Mostly so we don't end up in a replacement loop.
 *
 * @internal
 */
export const MAX_REPLACEMENTS = 3;

/**
 * @internal
 */
export function replacementRunnerName(stolenRunnerName: string): string {
  const match = stolenRunnerName.match(/^(.*)-r(\d+)$/);
  const base = match ? match[1] : stolenRunnerName;
  const attempt = match ? parseInt(match[2], 10) + 1 : 1;
  const suffix = `-r${attempt}`;

  return `${base.slice(0, MAX_RUNNER_NAME_LENGTH - suffix.length)}${suffix}`;
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
async function listJobs(owner: string, repo: string, workflowId: number, installationId?: number) {
  const { octokit } = await getOctokit(installationId);

  return octokit.paginate(octokit.rest.actions.listJobsForWorkflowRun, {
    owner,
    repo,
    run_id: workflowId,
    filter: 'all', // all workflow attempts
    per_page: 100,
  });
}

async function jobIdFromRunner(report: RunnerReportMessage, installationId: number): Promise<number | undefined> {
  const [owner, repo] = report.repo.split('/');
  if (!owner || !repo) {
    console.warn({ notice: 'Runner reported a repository we cannot parse', report });
    return undefined;
  }

  let jobs;
  try {
    jobs = await listJobs(owner, repo, report.workflowId, installationId > 0 ? installationId : undefined);
  } catch (e) {
    if (!isNotFound(e)) {
      throw e;
    }

    // the thief can be in a repository -- even an organization -- outside the installation that asked for this
    // runner, and that installation's token can't see its jobs. ask the app which installation can.
    let thiefInstallationId: number | undefined;
    try {
      thiefInstallationId = await resolveInstallationId(owner, repo);
    } catch (e2) {
      if (!isNotFound(e2)) { throw e2; }
    }
    if (thiefInstallationId === undefined) {
      // our app isn't installed there, so we have no way to see what that repository ran. we cannot call this
      // theft either: the repository name comes from the runner, and a job can print any name it likes.
      console.warn({
        notice: 'Cannot see the repository this runner reported, so cannot tell whether it was stolen. Install the GitHub app on every repository in the organization to detect runners taken by them.',
        report,
      });
      return undefined;
    }

    try {
      jobs = await listJobs(owner, repo, report.workflowId, thiefInstallationId);
    } catch (e2) {
      if (isNotFound(e2)) {
        // no such run. the report was made up, or the run is already gone.
        console.warn({ notice: 'GitHub knows nothing about the run this runner reported', report });
        return undefined;
      }
      throw e2;
    }
  }

  const job = jobs.find(j => j.runner_name === report.runnerName);
  if (!job) {
    console.warn({
      notice: 'No job in this run ran on this runner',
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
  const runnerName = replacementRunnerName(stolenRunnerName);

  const attempt = parseInt(runnerName.match(/-r(\d+)$/)?.[1] ?? '1', 10);
  if (attempt > MAX_REPLACEMENTS) {
    // whoever keeps taking these runners is going to take the next one too
    console.warn({
      notice: 'Runner was stolen, but it has already been replaced too many times',
      metric: 'StolenRunnerGaveUp',
      stolenRunnerName,
      attempt,
      jobUrl: input.jobUrl,
    });
    return;
  }

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

  const jobId = await jobIdFromRunner(report, input.installationId);

  if (jobId === undefined) {
    // GitHub didn't confirm this runner ran anything we can see, and only GitHub gets to decide that. the report
    // itself proves nothing -- it comes from the runner, and a job can print whatever it likes. acting here would
    // let any job on any of our runners buy itself a free extra runner.
    console.warn({ notice: 'Could not tell which job this runner ran, so not replacing it', report });
    return;
  }

  if (jobId === input.jobId) {
    // ran the job it was started for, which is the whole point
    return;
  }

  if (await isControlledJob(jobId)) {
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
  await replaceRunner(report.runnerName, input, jobId);
}

const reportedRunners = new Set<string>();

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
  const reportedRunnersInThisDelivery = new Set<string>();
  for (const logEvent of payload.logEvents) {
    const message = parseRunnerReport(logEvent.message);
    if (message) {
      // don't let misconfigured/malicious jobs make us start or even query too many runners.
      // there should only ever be one report per runner and any malicious code shouldn't be able to guess our runner names.
      // runner names are based on github webhook execution ids, which are random uuids.
      if (reportedRunners.has(message.runnerName) || reportedRunnersInThisDelivery.has(message.runnerName)) {
        console.log({ notice: 'Already handled a report from this runner', runnerName: message.runnerName });
        continue;
      }
      reportedRunnersInThisDelivery.add(message.runnerName);
      // put on queue so webhook has time to arrive and write to DDB before we try to read it
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
    for (const report of batch) {
      reportedRunners.add(report.runnerName);
    }
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
  //   2. we only ever act on the first report for a runner (see claimReport)
  //   3. the new runner we will start will have a specific name and step functions will reject duplicate names
  // so malicious code shouldn't be able to trick us into starting too many runners, or into making us call GitHub
  // over and over until we run out of rate limit for starting runners
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
