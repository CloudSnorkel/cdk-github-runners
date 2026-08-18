import * as zlib from 'zlib';
import * as AWSLambda from 'aws-lambda';
import type { OrchestratorInput, RunnerReportMessage } from '../src/lambda-tracker';

// Mock AWS SDK clients before importing the handler
const mockSfnSend = jest.fn();
const mockSqsSend = jest.fn();

jest.mock('@aws-sdk/client-sqs', () => {
  const actual = jest.requireActual('@aws-sdk/client-sqs');
  return {
    ...actual,
    SQSClient: jest.fn().mockImplementation(() => ({ send: mockSqsSend })),
  };
});

jest.mock('@aws-sdk/client-sfn', () => {
  const actual = jest.requireActual('@aws-sdk/client-sfn');
  return {
    ...actual,
    SFNClient: jest.fn().mockImplementation(() => ({ send: mockSfnSend })),
  };
});

const mockPaginate = jest.fn();
const mockGetOctokit = jest.fn();
const mockResolveInstallationId = jest.fn();

jest.mock('../src/lambda-github', () => ({
  getOctokit: (...args: unknown[]) => {
    mockGetOctokit(...args);
    return Promise.resolve({
      octokit: {
        paginate: (...pargs: unknown[]) => mockPaginate(...pargs),
        rest: { actions: { listJobsForWorkflowRun: 'listJobsForWorkflowRun' } },
      },
      githubSecrets: {},
    });
  },
  resolveInstallationId: (...args: unknown[]) => mockResolveInstallationId(...args),
  isNotFound: (e: unknown) => (e as { status?: number })?.status === 404,
}));

const mockIsControlledJob = jest.fn();
const mockClaimReport = jest.fn();

jest.mock('../src/lambda-tracker', () => ({
  isControlledJob: (...args: unknown[]) => mockIsControlledJob(...args),
  claimReport: (...args: unknown[]) => mockClaimReport(...args),
  WARM_RUNNER_JOB_ID: -1,
}));

function notFound() {
  return Object.assign(new Error('Not Found'), { status: 404 });
}

// Import handler after mocks are set up
import { handler, parseRunnerReport, replacementRunnerName } from '../src/stolen-runner-handler.lambda';

const STEP_FUNCTION_ARN = 'arn:aws:states:us-east-1:123456789012:stateMachine:runners';
const RUNNER_NAME = 'my-repo-ea8a0021-6ba6-4986-9102-51c567e55733';
const OUR_JOB_ID = 1000;
const THIEF_JOB_ID = 2000;
const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/reports';

function createInput(overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    owner: 'my-org',
    repo: 'my-repo',
    jobId: OUR_JOB_ID,
    jobUrl: 'https://github.com/my-org/my-repo/actions/runs/1/job/1000',
    installationId: 42,
    jobLabels: 'self-hosted,linux',
    provider: 'Stack/Provider',
    labels: 'self-hosted,linux',
    maxIdleSeconds: 300,
    ...overrides,
  };
}

/** The step function knows what every runner was started for. */
function runnerWasStartedFor(input: OrchestratorInput | undefined) {
  const { ExecutionDoesNotExist } = jest.requireActual('@aws-sdk/client-sfn');
  mockSfnSend.mockImplementation(async (command: any) => {
    if (command.constructor.name === 'DescribeExecutionCommand') {
      if (!input) {
        throw new ExecutionDoesNotExist({ message: 'nope', $metadata: {} });
      }
      return { input: JSON.stringify(input) };
    }
    return { executionArn: 'arn:execution' };
  });
}

/** GitHub says these jobs ran in the reported run attempt. */
function githubJobs(jobs: { id: number; runner_name: string | null }[]) {
  mockPaginate.mockResolvedValue(jobs);
}

function report(overrides: Partial<RunnerReportMessage> = {}): RunnerReportMessage {
  return {
    kind: 'report',
    runnerName: RUNNER_NAME,
    repo: 'my-org/my-repo',
    workflowId: 555,
    ...overrides,
  };
}

function sqsEvent(reports: RunnerReportMessage[]): AWSLambda.SQSEvent {
  return {
    Records: reports.map((message, i) => ({
      messageId: `msg-${i}`,
      receiptHandle: `receipt-${i}`,
      body: JSON.stringify(message),
      attributes: {},
      messageAttributes: {},
      md5OfBody: '',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:queue',
      awsRegion: 'us-east-1',
    })) as any,
  };
}

function startedExecutions() {
  return mockSfnSend.mock.calls
    .map(call => call[0])
    .filter(command => command.constructor.name === 'StartExecutionCommand');
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.STEP_FUNCTION_ARN = STEP_FUNCTION_ARN;
  process.env.JOB_ASSIGNMENT_QUEUE_URL = QUEUE_URL;
  mockIsControlledJob.mockResolvedValue(false);
  mockClaimReport.mockResolvedValue(true);
  mockResolveInstallationId.mockResolvedValue(undefined);
  runnerWasStartedFor(createInput());
  githubJobs([{ id: OUR_JOB_ID, runner_name: RUNNER_NAME }]);
});

describe('runner reports', () => {
  test('a runner running the job it was started for is left alone', async () => {
    await handler(sqsEvent([report()]));

    expect(startedExecutions()).toHaveLength(0);
    // no need to ask whether it is a job we control, it is the job this runner exists for
    expect(mockIsControlledJob).not.toHaveBeenCalled();
  });

  test('a runner running another job of ours is left alone', async () => {
    // GitHub shuffled jobs between runners we started -- every job involved has a runner
    githubJobs([{ id: THIEF_JOB_ID, runner_name: RUNNER_NAME }]);
    mockIsControlledJob.mockResolvedValue(true);

    await handler(sqsEvent([report()]));

    expect(mockIsControlledJob).toHaveBeenCalledWith(THIEF_JOB_ID);
    expect(startedExecutions()).toHaveLength(0);
  });

  test('a runner running a job we never started it for is replaced', async () => {
    githubJobs([{ id: THIEF_JOB_ID, runner_name: RUNNER_NAME }]);
    mockIsControlledJob.mockResolvedValue(false);

    await handler(sqsEvent([report({ repo: 'other-org/other-repo', workflowId: 999 })]));

    const started = startedExecutions();
    expect(started).toHaveLength(1);
    expect(started[0].input.stateMachineArn).toEqual(STEP_FUNCTION_ARN);
    expect(started[0].input.name).toEqual(`${RUNNER_NAME}-r1`);
    // the replacement is the same runner, for the same job, as the one that was taken
    expect(JSON.parse(started[0].input.input)).toEqual(createInput());
  });

  test('the job is resolved from the reported run attempt', async () => {
    githubJobs([
      { id: 111, runner_name: 'somebody-elses-runner' },
      { id: THIEF_JOB_ID, runner_name: RUNNER_NAME },
      { id: 222, runner_name: null },
    ]);

    await handler(sqsEvent([report({ repo: 'other-org/other-repo', workflowId: 999 })]));

    expect(mockPaginate).toHaveBeenCalledWith('listJobsForWorkflowRun', expect.objectContaining({
      owner: 'other-org',
      repo: 'other-repo',
      run_id: 999,
      filter: 'all',
    }));
    expect(mockIsControlledJob).toHaveBeenCalledWith(THIEF_JOB_ID);
    expect(startedExecutions()).toHaveLength(1);
  });

  test('a report GitHub does not confirm is never acted on', async () => {
    // the repo and run in a report come from the runner, and a job can print whatever it likes. only GitHub saying
    // "this runner ran this job" is evidence, so no match means no replacement -- otherwise any job on any of our
    // runners could print a made up repo and buy itself a free extra runner.
    mockPaginate.mockResolvedValue([]);

    await handler(sqsEvent([report({ repo: 'stranger/repo', workflowId: 999 })]));

    expect(startedExecutions()).toHaveLength(0);
  });

  test('a repository outside our installation is looked up and then reported stolen', async () => {
    // the thief can be in a repo, or even an org, the installation that asked for this runner cannot see
    mockPaginate
      .mockResolvedValueOnce([{ id: THIEF_JOB_ID, runner_name: RUNNER_NAME }]);
    mockResolveInstallationId.mockResolvedValue(99);

    await handler(sqsEvent([report({ repo: 'other-org/other-repo', workflowId: 999 })]));

    expect(mockResolveInstallationId).toHaveBeenCalledWith('other-org', 'other-repo');
    expect(mockGetOctokit).toHaveBeenLastCalledWith(99);
    expect(startedExecutions()).toHaveLength(1);
  });

  test('a repository our app is not installed means stolen', async () => {
    // we genuinely cannot tell theft from a shuffle here, and guessing would be forgeable
    mockPaginate.mockRejectedValue(notFound());
    mockResolveInstallationId.mockRejectedValue(notFound());

    const result = await handler(sqsEvent([report({ repo: 'stranger/repo', workflowId: 999 })]));

    expect(startedExecutions()).toHaveLength(1);
    // and it is not retried: a 404 will still be a 404 in three minutes, and the rate limit it burns is the same
    // one that mints runner registration tokens
    expect((result as AWSLambda.SQSBatchResponse).batchItemFailures).toHaveLength(0);
  });

  test('a runner stolen over and over is eventually left alone', async () => {
    githubJobs([{ id: THIEF_JOB_ID, runner_name: `${RUNNER_NAME}-r3` }]);

    await handler(sqsEvent([report({ runnerName: `${RUNNER_NAME}-r3` })]));

    expect(startedExecutions()).toHaveLength(0);
  });

  test('runners we did not start are ignored', async () => {
    runnerWasStartedFor(undefined);

    await handler(sqsEvent([report({ runnerName: 'somebody-elses-runner' })]));

    expect(mockPaginate).not.toHaveBeenCalled();
    expect(startedExecutions()).toHaveLength(0);
  });

  test('warm runners are never replaced', async () => {
    // warm runners are not started for anyone in particular, and their keeper replaces them on its own
    runnerWasStartedFor(createInput({ jobId: -1 }));

    await handler(sqsEvent([report()]));

    expect(mockPaginate).not.toHaveBeenCalled();
    expect(startedExecutions()).toHaveLength(0);
  });

  test('hearing about the same theft twice only replaces the runner once', async () => {
    const { ExecutionAlreadyExists } = jest.requireActual('@aws-sdk/client-sfn');
    githubJobs([{ id: THIEF_JOB_ID, runner_name: RUNNER_NAME }]);
    let starts = 0;
    mockSfnSend.mockImplementation(async (command: any) => {
      if (command.constructor.name === 'DescribeExecutionCommand') {
        return { input: JSON.stringify(createInput()) };
      }
      if (++starts > 1) {
        throw new ExecutionAlreadyExists({ message: 'already', $metadata: {} });
      }
      return { executionArn: 'arn:execution' };
    });

    const result = await handler(sqsEvent([report(), report()])) as AWSLambda.SQSBatchResponse;

    // both computed the same name, so step functions refused the second
    expect(startedExecutions().map(c => c.input.name)).toEqual([`${RUNNER_NAME}-r1`, `${RUNNER_NAME}-r1`]);
    expect(result.batchItemFailures).toHaveLength(0);
  });

  test('a replacement that gets stolen too is replaced again', async () => {
    githubJobs([{ id: THIEF_JOB_ID, runner_name: `${RUNNER_NAME}-r1` }]);

    await handler(sqsEvent([report({ runnerName: `${RUNNER_NAME}-r1` })]));

    expect(startedExecutions()[0].input.name).toEqual(`${RUNNER_NAME}-r2`);
  });

  test('failures are retried', async () => {
    mockPaginate.mockRejectedValue(new Error('GitHub is having a bad day'));

    const result = await handler(sqsEvent([report()])) as AWSLambda.SQSBatchResponse;

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-0' }]);
  });

  test('unparsable messages are dropped', async () => {
    const event = sqsEvent([report()]);
    event.Records[0].body = 'not json';

    const result = await handler(event) as AWSLambda.SQSBatchResponse;

    expect(result.batchItemFailures).toHaveLength(0);
  });
});

describe('runner log delivery', () => {
  function logsEvent(messages: string[]): any {
    const payload = {
      messageType: 'DATA_MESSAGE',
      owner: '123456789012',
      logGroup: '/aws/codebuild/runners',
      logStream: 'runner-1',
      subscriptionFilters: ['filter'],
      logEvents: messages.map((message, i) => ({ id: `${i}`, timestamp: Date.now(), message })),
    };
    return { awslogs: { data: zlib.gzipSync(Buffer.from(JSON.stringify(payload))).toString('base64') } };
  }

  test('reports are queued for processing', async () => {
    await handler(logsEvent([
      `CDKGHR JOB RUNNER=${RUNNER_NAME} REPO=thief-org/thief-repo WORKFLOW_ID=987654321`,
      'CDKGHR JOB RUNNER=other-runner REPO=org/repo WORKFLOW_ID=42',
    ]));

    expect(mockSqsSend).toHaveBeenCalledTimes(1);
    const command = mockSqsSend.mock.calls[0][0];
    expect(command.input.QueueUrl).toEqual(QUEUE_URL);
    expect(command.input.Entries).toHaveLength(2);
    expect(JSON.parse(command.input.Entries[0].MessageBody)).toEqual({
      kind: 'report',
      runnerName: RUNNER_NAME,
      repo: 'thief-org/thief-repo',
      workflowId: 987654321,
    });
    // nothing is decided on the delivery itself, it all goes through the queue
    expect(startedExecutions()).toHaveLength(0);
  });

  // handleRunnerLogs remembers reported runners in module scope so a warm container doesn't re-queue them, and
  // jest.clearAllMocks() can't reach that. every test below uses its own runner names so they don't suppress
  // each other, and so they don't depend on the order they run in.

  test('only the first report from a runner is queued', async () => {
    // a runner runs one job, so it has one thing to say. a job printing the marker itself, or a duplicated
    // delivery, must not cost a step function call and a GitHub call each.
    const line = 'CDKGHR JOB RUNNER=flood-runner REPO=thief-org/thief-repo WORKFLOW_ID=987654321';

    await handler(logsEvent(Array(50).fill(line)));

    expect(mockSqsSend).toHaveBeenCalledTimes(1);
    expect(mockSqsSend.mock.calls[0][0].input.Entries).toHaveLength(1);
  });

  test('a repeat cannot hide behind a different repo or run', async () => {
    // only the runner name is deduplicated, because that is the only part a forged line cannot make up
    await handler(logsEvent([
      'CDKGHR JOB RUNNER=disguise-runner REPO=thief-org/thief-repo WORKFLOW_ID=987654321',
      'CDKGHR JOB RUNNER=disguise-runner REPO=made-up/repo WORKFLOW_ID=1',
      'CDKGHR JOB RUNNER=disguise-runner REPO=another/repo WORKFLOW_ID=2',
    ]));

    const entries = mockSqsSend.mock.calls[0][0].input.Entries;
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0].MessageBody).repo).toEqual('thief-org/thief-repo');
  });

  test('runners sharing a log stream all get through', async () => {
    // the Lambda provider reuses a log stream across invocations, so one stream carries several runners
    await handler(logsEvent([
      'CDKGHR JOB RUNNER=shared-one REPO=org/repo WORKFLOW_ID=1',
      'CDKGHR JOB RUNNER=shared-one REPO=org/repo WORKFLOW_ID=1',
      'CDKGHR JOB RUNNER=shared-two REPO=org/repo WORKFLOW_ID=2',
      'CDKGHR JOB RUNNER=shared-three REPO=org/repo WORKFLOW_ID=3',
    ]));

    const entries = mockSqsSend.mock.calls[0][0].input.Entries;
    expect(entries).toHaveLength(3);
    expect(entries.map((e: any) => JSON.parse(e.MessageBody).runnerName))
      .toEqual(['shared-one', 'shared-two', 'shared-three']);
  });

  test('a runner that already reported is not queued again by a later delivery', async () => {
    // a warm container remembers, so a repeat spread across deliveries costs nothing either
    const line = 'CDKGHR JOB RUNNER=across-deliveries REPO=org/repo WORKFLOW_ID=9';

    await handler(logsEvent([line]));
    expect(mockSqsSend).toHaveBeenCalledTimes(1);

    await handler(logsEvent([line]));
    expect(mockSqsSend).toHaveBeenCalledTimes(1);
  });

  test('unparsable lines are dropped', async () => {
    await handler(logsEvent(['CDKGHA JOB STARTED but-then-nothing-useful']));

    expect(mockSqsSend).not.toHaveBeenCalled();
  });
});

describe('replacementRunnerName', () => {
  test('is derived from the stolen runner', () => {
    expect(replacementRunnerName('my-repo-1234')).toEqual('my-repo-1234-r1');
  });

  test('counts up instead of stacking suffixes', () => {
    expect(replacementRunnerName('my-repo-1234-r1')).toEqual('my-repo-1234-r2');
    expect(replacementRunnerName('my-repo-1234-r9')).toEqual('my-repo-1234-r10');
  });

  test('stays within the runner name limit', () => {
    const name = replacementRunnerName(`${'a'.repeat(50)}-123456789012`);
    expect(name).toHaveLength(64);
    expect(name.endsWith('-r1')).toBeTruthy();
  });
});

describe('parseRunnerReport', () => {
  test('parses a bare report', () => {
    expect(parseRunnerReport('CDKGHR JOB RUNNER=my-repo-abc123 REPO=thief-org/thief-repo WORKFLOW_ID=987654321')).toEqual({
      kind: 'report',
      runnerName: 'my-repo-abc123',
      repo: 'thief-org/thief-repo',
      workflowId: 987654321,
    });
  });

  test('parses a report prefixed by the provider', () => {
    // CodeBuild and friends prefix every log line, and another writer can leave one unterminated before ours
    const line = '[Container] 2026/08/10 12:00:00.123456 CDKGHR JOB RUNNER=my-repo-abc123 REPO=org/repo WORKFLOW_ID=42';
    expect(parseRunnerReport(line)).toMatchObject({ runnerName: 'my-repo-abc123', repo: 'org/repo', workflowId: 42 });
  });

  test('ignores other lines', () => {
    expect(parseRunnerReport('CDKGHA JOB DONE linux Succeeded')).toBeUndefined();
    expect(parseRunnerReport('just some runner output')).toBeUndefined();
    // unset environment variables produce a short line, which must not misparse into something we act on
    expect(parseRunnerReport('CDKGHR JOB    ')).toBeUndefined();
  });
});
