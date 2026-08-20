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
import { MAX_RUNNER_NAME_LENGTH, OrchestratorInput, WARM_RUNNER_JOB_ID } from './lambda-common';
import { getOctokit, isNotFound, resolveInstallationId } from './lambda-github';
import { isControlledJob, RunnerReportMessage } from './lambda-tracker';

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

type JobFromReport =
  | { result: 'job'; jobId: number }
  | { result: 'unknown' }
  | { result: 'invisible-repo' };

async function findJobFromReport(report: RunnerReportMessage): Promise<JobFromReport> {
  const [owner, repo] = report.repo.split('/');
  if (!owner || !repo) {
    console.warn({ notice: 'Runner reported a repository we cannot parse', report });
    return { result: 'unknown' };
  }

  let installationId: number | undefined;
  try {
    installationId = await resolveInstallationId(owner, repo);
  } catch (e) {
    if (!isNotFound(e)) {
      throw e;
    }
    // our app isn't installed there, so we never started a runner for anything in that repo.
    // the job that ran there was stolen the runner from someone else.
    //
    // this assumption only works for app authentication where the webhook notifies us of jobs on the repos the app is installed on. and in turn the
    // app only has access to, and can only start runners for, the repos it is installed on.
    //
    // PAT have no such promise: they ignore installation ids entirely, so a hand configured webhook works and the two sets can drift apart.
    // that is why this branch is unreachable for them. we can't guarantee (yet) that we will fail to list jobs because the repo truly doesn't exist.
    // a 404 below on listJobs() can mean the job truly doesn't exist, or it can mean the repo exists but the PAT doesn't have access to it while the
    // webhook does report on it.
    return { result: 'invisible-repo' };
  }

  let jobs;
  try {
    jobs = await listJobs(owner, repo, report.workflowId, installationId);
  } catch (e) {
    if (!isNotFound(e)) {
      throw e;
    }
    // we can see this repo and there is no such run, so the runner made it up
    console.warn({ notice: 'GitHub knows nothing about the run this runner reported', report });
    return { result: 'unknown' };
  }

  const job = jobs.find(j => j.runner_name === report.runnerName);
  if (!job) {
    console.warn({ notice: 'No job in this run ran on this runner', report, jobs: jobs.length });
    return { result: 'unknown' };
  }

  return { result: 'job', jobId: job.id };
}

/**
 * Start another runner just like the one that was taken.
 */
async function replaceRunner(stolenRunnerName: string, input: OrchestratorInput, thiefJobId?: number) {
  const runnerName = replacementRunnerName(stolenRunnerName);

  const attempt = parseInt(runnerName.match(/-r(\d+)$/)?.[1] ?? '1', 10);
  if (attempt > MAX_REPLACEMENTS) {
    // avoid infinite loops if a runner is stolen repeatedly
    // it might be a bug in our detection...
    console.warn({
      notice: 'Runner was stolen, not replaced because it has already been replaced too many times',
      metric: 'StolenRunnerDetected',
      replaced: 'false', // metric filter drops ALL dimensions for if this is a real boolean
      stolenRunnerName,
      runnerName,
      attempt,
      stolenByJobId: thiefJobId,
      jobId: input.jobId,
      jobUrl: input.jobUrl,
      owner: input.owner,
      repo: input.repo,
      provider: input.provider,
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
    replaced: 'true', // metric filter drops ALL dimensions for if this is a real boolean
    stolenRunnerName,
    runnerName,
    attempt,
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
    // warm runners aren't started for any job in particular, so nothing they run is technically stolen
    // warm runner keeper starts a replacement on its own as soon as it sees a warm runner go busy
    console.log({
      notice: 'Warm runner taken',
      metric: 'WarmRunnerTaken',
      runnerName: report.runnerName,
      repo: report.repo,
      runId: report.workflowId,
    });
    return;
  }

  let jobId = report.jobId; // can be reported from workflow_job.in_progress directly
  if (jobId === undefined) {
    const job = await findJobFromReport(report);

    if (job.result === 'invisible-repo') {
      // nothing we start could be running there, so this one was stolen
      console.warn({
        notice: 'Runner ran a job in a repository our app cannot see',
        report,
      });
      await replaceRunner(report.runnerName, input);
      return;
    }

    if (job.result === 'unknown') {
      // we couldn't find the job, even though we should have
      // bad input... don't act on it
      console.warn({
        notice: 'Could not tell which job this runner ran',
        report,
      });
      return;
    }

    jobId = job.jobId;
  }

  if (jobId === input.jobId) {
    // ran the job it was started for, which is the whole point
    // no need to do anything or even check the jobs table...
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
      if (reportedRunnersInThisDelivery.has(message.runnerName)) {
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
        // one report per runner. the webhook sends the same pair, so whichever arrives first wins and the other is
        // dropped by the queue. a group per runner means runners never queue behind each other.
        MessageGroupId: message.runnerName,
        MessageDeduplicationId: message.runnerName,
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
  //   2. we only ever act on the first report for a runner (the queue deduplicates on the runner name)
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
