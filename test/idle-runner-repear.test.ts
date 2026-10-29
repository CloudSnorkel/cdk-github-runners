const mockSfnSend = jest.fn();
const mockGetOctokit = jest.fn();
const mockGetRunner = jest.fn();
const mockDeleteRunner = jest.fn();
const mockTerminateRunnerInstances = jest.fn();
const mockForgetControlledJob = jest.fn();
const mockIsRunnerAccounted = jest.fn();
const mockRecordRunnerAccounted = jest.fn();
const mockGetJob = jest.fn();
const mockSqsSend = jest.fn();

jest.mock('@aws-sdk/client-sfn', () => ({
  ...jest.requireActual('@aws-sdk/client-sfn'),
  SFNClient: jest.fn(() => ({ send: (...args: unknown[]) => mockSfnSend(...args) })),
  DescribeExecutionCommand: jest.fn(input => ({ command: 'DescribeExecution', input })),
  StopExecutionCommand: jest.fn(input => ({ command: 'StopExecution', input })),
}));

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn(() => ({ send: (...args: unknown[]) => mockSqsSend(...args) })),
  SendMessageCommand: jest.fn(input => ({ command: 'SendMessage', input })),
}));

jest.mock('../src/lambda-github', () => ({
  getOctokit: (...args: unknown[]) => mockGetOctokit(...args),
  cachedGetOctokit: () => (...args: unknown[]) => mockGetOctokit(...args),
  getRunner: (...args: unknown[]) => mockGetRunner(...args),
  deleteRunner: (...args: unknown[]) => mockDeleteRunner(...args),
  isNotFound: jest.requireActual('../src/lambda-github').isNotFound,
}));

jest.mock('../src/lambda-ec2', () => ({
  terminateRunnerInstances: (...args: unknown[]) => mockTerminateRunnerInstances(...args),
}));

jest.mock('../src/lambda-tracker', () => ({
  forgetControlledJob: (...args: unknown[]) => mockForgetControlledJob(...args),
  isRunnerAccounted: (...args: unknown[]) => mockIsRunnerAccounted(...args),
  recordRunnerAccounted: (...args: unknown[]) => mockRecordRunnerAccounted(...args),
}));

// Import handler after mocks are set up
import { handler } from '../src/idle-runner-repear.lambda';

const INPUT = {
  executionArn: 'arn:aws:states:us-east-1:123456789012:execution:runners:runner-1',
  runnerName: 'runner-1',
  owner: 'my-org',
  repo: 'my-repo',
  installationId: 123,
  maxIdleSeconds: 300,
};

const event = (body: object) => ({ Records: [{ messageId: 'message-1', body: JSON.stringify(body) }] }) as any;

// the message the step function queues, before we ever saw the runner idle
const EVENT = event(INPUT);
// the message we queue after seeing runner 42 idle a long time ago
const IDLE_EVENT = event({ ...INPUT, runnerId: 42, idleSince: Date.now() - 1000 * 1000 });
// the message we queue after seeing runner 42 idle just now
const FRESH_EVENT = event({ ...INPUT, runnerId: 42, idleSince: Date.now() });

const IDLE_RUNNER = { id: 42, name: 'runner-1', busy: false, status: 'online', labels: [] };
const BUSY_RUNNER = { ...IDLE_RUNNER, busy: true };
const OFFLINE_RUNNER = { ...IDLE_RUNNER, status: 'offline' };

/**
 * Idle runner-1 was started for `jobId`. `jobs` maps job ids to the runner GitHub assigned them to (undefined while waiting).
 * `runners` maps our other runners to the job they were started for. Runners not in there aren't ours.
 */
function reapRunnerFor(jobId: number, jobs: Record<number, string | undefined>, runners: Record<string, number> = {}, status = 'queued') {
  const { ExecutionDoesNotExist } = jest.requireActual('@aws-sdk/client-sfn');
  const input = (id: number) => JSON.stringify({ owner: 'my-org', repo: 'my-repo', jobId: id, installationId: 123 });

  mockSfnSend.mockImplementation(async (command: any) => {
    if (command.command != 'DescribeExecution') {
      return {};
    }
    const name = command.input.executionArn.split(':').pop();
    if (name == 'runner-1') {
      return { status: 'RUNNING', input: input(jobId) };
    }
    if (name in runners) {
      return { status: 'RUNNING', input: input(runners[name]) };
    }
    throw new ExecutionDoesNotExist({ message: 'nope', $metadata: {} });
  });
  mockGetOctokit.mockResolvedValue({
    octokit: { rest: { actions: { getJobForWorkflowRun: mockGetJob } } },
    githubSecrets: { runnerLevel: 'repo' },
  });
  mockGetJob.mockImplementation(async ({ job_id }: { job_id: number }) => ({
    data: { id: job_id, status: jobs[job_id] ? 'in_progress' : status, runner_name: jobs[job_id] ?? null },
  }));
  mockGetRunner.mockResolvedValue(IDLE_RUNNER);
  mockDeleteRunner.mockResolvedValue(undefined);
}

const retried = (result: { batchItemFailures: unknown[] }) => result.batchItemFailures.length > 0;

describe('idle-runner-repear', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockGetOctokit.mockResolvedValue({
      octokit: {},
      githubSecrets: { runnerLevel: 'repo' },
    });

    mockTerminateRunnerInstances.mockResolvedValue([]);
    mockForgetControlledJob.mockResolvedValue(undefined);
    mockIsRunnerAccounted.mockResolvedValue(false);
    mockRecordRunnerAccounted.mockResolvedValue(undefined);
    mockSqsSend.mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Succeeded step function needs no clean-up', async () => {
    mockSfnSend.mockResolvedValue({ status: 'SUCCEEDED' });

    expect(retried(await handler(EVENT))).toBe(false);

    expect(mockGetRunner).not.toHaveBeenCalled();
    expect(mockDeleteRunner).not.toHaveBeenCalled();
  });

  // Step Functions kills an execution that reaches 25,000 history events, and it never gets to clean up its runner
  test('Killed step function gets its runner deleted once it is idle for too long', async () => {
    mockSfnSend.mockResolvedValue({ status: 'FAILED', error: 'States.Runtime' });
    mockGetRunner.mockResolvedValue(IDLE_RUNNER);
    mockDeleteRunner.mockResolvedValue(undefined);

    // the runner is deleted, but we keep the message so we can terminate the instance if it doesn't power itself off
    expect(retried(await handler(IDLE_EVENT))).toBe(true);

    expect(mockDeleteRunner).toHaveBeenCalledWith({}, 'repo', 'my-org', 'my-repo', 42);
    // there is no step function left to stop
    expect(mockSfnSend.mock.calls.map(c => c[0].command)).toEqual(['DescribeExecution']);
  });

  // we already paid to start this runner, so let GitHub have a chance to put a job on it
  test('Killed step function keeps a runner that is not idle for too long yet', async () => {
    mockSfnSend.mockResolvedValue({ status: 'FAILED', error: 'States.Runtime' });
    mockGetRunner.mockResolvedValue(IDLE_RUNNER);

    expect(retried(await handler(FRESH_EVENT))).toBe(true);

    expect(mockDeleteRunner).not.toHaveBeenCalled();
  });

  // a stopped step function runs no cleaners, so this message is the only thing that can ever terminate the instance
  // behind this runner once it finishes its job. dropping it would leave a failed poweroff running forever
  test('Stopped step function keeps watching a busy runner', async () => {
    mockSfnSend.mockResolvedValue({ status: 'ABORTED' });
    mockGetRunner.mockResolvedValue(BUSY_RUNNER);

    expect(retried(await handler(EVENT))).toBe(true);

    expect(mockDeleteRunner).not.toHaveBeenCalled();
    // nothing to terminate yet -- it is still running a job
    expect(mockTerminateRunnerInstances).not.toHaveBeenCalled();
  });

  test('Stopped step function with no runner is dropped', async () => {
    mockSfnSend.mockResolvedValue({ status: 'ABORTED' });
    mockGetRunner.mockResolvedValue(undefined);

    expect(retried(await handler(EVENT))).toBe(false);

    expect(mockDeleteRunner).not.toHaveBeenCalled();
  });

  // this retry used to be dead: we stop the step function before deleting, so the next delivery saw a stopped
  // execution and dropped the message, leaving the runner behind
  test('Failed delete of a stopped step function runner is retried', async () => {
    mockSfnSend.mockResolvedValue({ status: 'ABORTED' });
    mockGetRunner.mockResolvedValue(IDLE_RUNNER);
    mockDeleteRunner.mockRejectedValue(new Error('Internal server error'));

    expect(retried(await handler(IDLE_EVENT))).toBe(true);
  });

  test('Running step function with a busy runner is checked again later', async () => {
    mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
    mockGetRunner.mockResolvedValue(BUSY_RUNNER);

    expect(retried(await handler(EVENT))).toBe(true);

    expect(mockDeleteRunner).not.toHaveBeenCalled();
  });

  test('Running step function stops itself before deleting an idle runner', async () => {
    mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
    mockGetRunner.mockResolvedValue(IDLE_RUNNER);
    mockDeleteRunner.mockResolvedValue(undefined);

    // same as above -- the message stays alive so the instance can be terminated later if needed
    expect(retried(await handler(IDLE_EVENT))).toBe(true);

    expect(mockSfnSend.mock.calls.map(c => c[0].command)).toEqual(['DescribeExecution', 'StopExecution']);
    expect(mockDeleteRunner).toHaveBeenCalledWith({}, 'repo', 'my-org', 'my-repo', 42);
  });

  // the dashboard counts reaped runners from this log line
  test('Logs a metric for the stopped step function', async () => {
    mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
    mockGetRunner.mockResolvedValue(IDLE_RUNNER);
    mockDeleteRunner.mockResolvedValue(undefined);

    await handler(IDLE_EVENT);

    expect(console.log).toHaveBeenCalledWith(expect.objectContaining({ metric: 'RunnerStopped', reason: 'IdleRunner' }));
  });

  test('Logs no metric when there is no step function left to stop', async () => {
    mockSfnSend.mockResolvedValue({ status: 'FAILED', error: 'States.Runtime' });
    mockGetRunner.mockResolvedValue(IDLE_RUNNER);
    mockDeleteRunner.mockResolvedValue(undefined);

    await handler(IDLE_EVENT);

    expect(console.log).not.toHaveBeenCalledWith(expect.objectContaining({ metric: 'RunnerStopped' }));
  });

  // GitHub can hold on to the job (e.g. during an outage) and hand it to another runner of ours later. that runner was
  // started for some other job, so the job we reaped must no longer count as ours for it to be detected as stolen.
  test('Forgets the job of a reaped runner', async () => {
    reapRunnerFor(1234, { 1234: undefined });

    await handler(IDLE_EVENT);

    expect(mockForgetControlledJob).toHaveBeenCalledWith(1234);
  });

  // GitHub handed our job to runner-2, so the job runner-2 was started for is the one left without a runner
  test('Forgets the job of the runner that took our job', async () => {
    reapRunnerFor(1234, { 1234: 'runner-2', 5678: undefined }, { 'runner-2': 5678 });

    await handler(IDLE_EVENT);

    expect(mockForgetControlledJob).toHaveBeenCalledWith(5678);
    expect(mockForgetControlledJob).toHaveBeenCalledTimes(1);
  });

  // e.g. a step function started by hand with the input of another one
  test('Forgets nothing when the job ran on a runner started for it', async () => {
    reapRunnerFor(1234, { 1234: 'runner-0' }, { 'runner-0': 1234 });

    await handler(EVENT);

    expect(mockForgetControlledJob).not.toHaveBeenCalled();
  });

  test('Forgets nothing when the job ran on a runner that is not ours', async () => {
    reapRunnerFor(1234, { 1234: 'somebody-else' });

    await handler(EVENT);

    expect(mockForgetControlledJob).not.toHaveBeenCalled();
  });

  test('Forgets nothing when the job was cancelled before it got a runner', async () => {
    reapRunnerFor(1234, { 1234: undefined }, {}, 'completed');

    await handler(EVENT);

    expect(mockForgetControlledJob).not.toHaveBeenCalled();
  });

  test('Forgets nothing for a warm runner', async () => {
    reapRunnerFor(-1, {});

    await handler(IDLE_EVENT);

    expect(mockGetJob).not.toHaveBeenCalled();
    expect(mockForgetControlledJob).not.toHaveBeenCalled();
    expect(mockDeleteRunner).toHaveBeenCalled();
  });

  test('Forgets nothing for a step function started by hand with bogus input', async () => {
    reapRunnerFor(1234, {});
    mockSfnSend.mockResolvedValue({ status: 'RUNNING', input: JSON.stringify({ hello: 'world' }) });

    await handler(IDLE_EVENT);

    expect(mockGetJob).not.toHaveBeenCalled();
    expect(mockForgetControlledJob).not.toHaveBeenCalled();
    expect(mockDeleteRunner).toHaveBeenCalled();
  });

  test('Forgets nothing for a job GitHub does not know', async () => {
    reapRunnerFor(1234, {});
    mockGetJob.mockRejectedValue({ status: 404 });

    await handler(IDLE_EVENT);

    expect(mockForgetControlledJob).not.toHaveBeenCalled();
    expect(mockDeleteRunner).toHaveBeenCalled();
  });

  test('Gives up on a chain that is too long', async () => {
    // job n ran on runner-n+1, which was started for job n+1
    const jobs: Record<number, string> = {};
    const runners: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      jobs[i] = `runner-${i + 2}`;
      runners[`runner-${i + 2}`] = i + 1;
    }
    reapRunnerFor(0, jobs, runners);

    await handler(IDLE_EVENT);

    expect(mockGetJob.mock.calls.length).toBeLessThan(100);
    expect(mockForgetControlledJob).not.toHaveBeenCalled();
    expect(mockDeleteRunner).toHaveBeenCalled();
  });

  test('Remembers the reaped runner was accounted for', async () => {
    reapRunnerFor(1234, { 1234: undefined });

    await handler(IDLE_EVENT);

    expect(mockRecordRunnerAccounted).toHaveBeenCalledWith('runner-1');
  });

  // the message is kept after deleting the runner, so the next delivery tries again
  test('Deletes the runner even if the job could not be forgotten', async () => {
    reapRunnerFor(1234, { 1234: undefined });
    mockForgetControlledJob.mockRejectedValue(new Error('ddb down'));

    expect(retried(await handler(IDLE_EVENT))).toBe(true);
    expect(mockDeleteRunner).toHaveBeenCalled();
    expect(mockRecordRunnerAccounted).not.toHaveBeenCalled();
  });

  // e.g. somebody deleted the runner by hand while it was idle
  test('Forgets the job of a succeeded step function that never reported a job', async () => {
    reapRunnerFor(1234, { 1234: undefined });
    mockSfnSend.mockResolvedValue({ status: 'SUCCEEDED', input: JSON.stringify({ owner: 'my-org', repo: 'my-repo', jobId: 1234 }) });

    expect(retried(await handler(EVENT))).toBe(false);
    expect(mockForgetControlledJob).toHaveBeenCalledWith(1234);
    expect(mockRecordRunnerAccounted).toHaveBeenCalledWith('runner-1');
  });

  test('Does not look for a job when the runner reported one', async () => {
    reapRunnerFor(1234, { 1234: undefined });
    mockSfnSend.mockResolvedValue({ status: 'SUCCEEDED', input: JSON.stringify({ owner: 'my-org', repo: 'my-repo', jobId: 1234 }) });
    mockIsRunnerAccounted.mockResolvedValue(true);

    expect(retried(await handler(EVENT))).toBe(false);
    expect(mockGetJob).not.toHaveBeenCalled();
    expect(mockForgetControlledJob).not.toHaveBeenCalled();
  });

  // the runner never registered, so its job may still be waiting for one
  test('Forgets the job of a failed step function with no runner', async () => {
    reapRunnerFor(1234, { 1234: undefined });
    mockSfnSend.mockResolvedValue({ status: 'FAILED', input: JSON.stringify({ owner: 'my-org', repo: 'my-repo', jobId: 1234 }) });
    mockGetRunner.mockResolvedValue(undefined);

    expect(retried(await handler(EVENT))).toBe(false);
    expect(mockForgetControlledJob).toHaveBeenCalledWith(1234);
    expect(mockTerminateRunnerInstances).toHaveBeenCalledWith('runner-1');
  });

  // the reaper keeps the message after deleting the runner, so it comes back once more with no runner. by then other
  // runners may have shuffled the jobs around, and walking again could forget a job that does have a runner coming.
  test('Does not forget again after reaping the runner itself', async () => {
    reapRunnerFor(1234, { 1234: undefined });
    mockSfnSend.mockResolvedValue({
      status: 'ABORTED',
      error: 'IdleRunner',
      input: JSON.stringify({ owner: 'my-org', repo: 'my-repo', jobId: 1234 }),
    });
    mockGetRunner.mockResolvedValue(undefined);
    mockIsRunnerAccounted.mockResolvedValue(true); // recorded when we reaped it

    expect(retried(await handler(EVENT))).toBe(false);
    expect(mockForgetControlledJob).not.toHaveBeenCalled();
    expect(mockTerminateRunnerInstances).toHaveBeenCalledWith('runner-1');
  });

  test('Failed step function with no runner is retried if the job could not be forgotten', async () => {
    reapRunnerFor(1234, { 1234: undefined });
    mockSfnSend.mockResolvedValue({ status: 'FAILED', input: JSON.stringify({ owner: 'my-org', repo: 'my-repo', jobId: 1234 }) });
    mockGetRunner.mockResolvedValue(undefined);
    mockForgetControlledJob.mockRejectedValue(new Error('ddb down'));

    expect(retried(await handler(EVENT))).toBe(true);
  });

  test('Does not forget the job of a runner that is not idle for too long yet', async () => {
    reapRunnerFor(1234, { 1234: undefined });
    mockGetRunner.mockResolvedValue(IDLE_RUNNER);

    await handler(EVENT);

    expect(mockForgetControlledJob).not.toHaveBeenCalled();
  });

  // the step function's catchers never run on a successful execution, so this is the only thing that will ever
  // notice an instance whose `poweroff` wedged after the job was reported done
  test('Terminates instances left behind by a successful execution', async () => {
    mockSfnSend.mockResolvedValue({ status: 'SUCCEEDED' });

    const result = await handler(EVENT);

    expect(retried(result)).toBe(false);
    expect(mockTerminateRunnerInstances).toHaveBeenCalledWith('runner-1');
    // it never had to ask GitHub anything
    expect(mockGetRunner).not.toHaveBeenCalled();
  });

  // a runner that never registered is what a failed boot looks like. GitHub has nothing to clean up, EC2 might
  test('Terminates instances when a stopped execution left no runner registered', async () => {
    mockSfnSend.mockResolvedValue({ status: 'ABORTED' });
    mockGetRunner.mockResolvedValue(undefined);

    const result = await handler(EVENT);

    expect(retried(result)).toBe(false);
    expect(mockTerminateRunnerInstances).toHaveBeenCalledWith('runner-1');
  });

  // the instance is still up and about to notice its runner is gone. terminating now cuts its logs off mid-line, so
  // we keep the message and let the no-runner branch terminate it next time if it hasn't powered off by then
  test('Keeps watching after reaping an idle runner instead of terminating it', async () => {
    mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
    mockGetRunner.mockResolvedValue(IDLE_RUNNER);
    mockDeleteRunner.mockResolvedValue(undefined);

    const result = await handler(IDLE_EVENT);

    expect(retried(result)).toBe(true);
    expect(mockDeleteRunner).toHaveBeenCalled();
    expect(mockTerminateRunnerInstances).not.toHaveBeenCalled();
  });

  test('Leaves a busy runner alone', async () => {
    mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
    mockGetRunner.mockResolvedValue(BUSY_RUNNER);

    await handler(EVENT);

    expect(mockTerminateRunnerInstances).not.toHaveBeenCalled();
  });

  // the idle timeout hasn't been reached, so the runner is still allowed to pick up a job
  test('Leaves a freshly idle runner alone', async () => {
    mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
    mockGetRunner.mockResolvedValue(IDLE_RUNNER);

    expect(retried(await handler(FRESH_EVENT))).toBe(true);

    expect(mockDeleteRunner).not.toHaveBeenCalled();
    expect(mockTerminateRunnerInstances).not.toHaveBeenCalled();
  });

  // seeing it idle once only starts the clock. the new message remembers the runner and when we saw it
  test('First time a runner is seen idle starts the clock with a new message', async () => {
    mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
    mockGetRunner.mockResolvedValue(IDLE_RUNNER);

    // the old message is done, the new one takes over
    expect(retried(await handler(EVENT))).toBe(false);

    expect(mockDeleteRunner).not.toHaveBeenCalled();
    expect(mockSqsSend).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockSqsSend.mock.calls[0][0].input.MessageBody);
    expect(body).toEqual({ ...INPUT, runnerId: 42, idleSince: expect.any(Number) });
  });

  // the step function retried and registered a new runner with the same name. it gets its own idle time
  test('A runner with a different id starts the clock over', async () => {
    mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
    mockGetRunner.mockResolvedValue({ ...IDLE_RUNNER, id: 43 });

    expect(retried(await handler(IDLE_EVENT))).toBe(false);

    expect(mockDeleteRunner).not.toHaveBeenCalled();
    expect(JSON.parse(mockSqsSend.mock.calls[0][0].input.MessageBody)).toMatchObject({ runnerId: 43 });
  });

  test('Failing to queue the new message keeps the old one', async () => {
    mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
    mockGetRunner.mockResolvedValue(IDLE_RUNNER);
    mockSqsSend.mockRejectedValue(new Error('SQS is down'));

    expect(retried(await handler(EVENT))).toBe(true);
  });

  // JIT runners are registered before they boot. some providers take more than 10 minutes to boot
  test('Offline runner of a running step function is still booting', async () => {
    mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
    mockGetRunner.mockResolvedValue(OFFLINE_RUNNER);

    expect(retried(await handler(IDLE_EVENT))).toBe(true);

    expect(mockSqsSend).not.toHaveBeenCalled();
    expect(mockDeleteRunner).not.toHaveBeenCalled();
  });

  // nothing will ever start it, so it's as good as idle
  test('Offline runner of a stopped step function is deleted once it is idle for too long', async () => {
    mockSfnSend.mockResolvedValue({ status: 'ABORTED' });
    mockGetRunner.mockResolvedValue(OFFLINE_RUNNER);
    mockDeleteRunner.mockResolvedValue(undefined);

    await handler(IDLE_EVENT);

    expect(mockDeleteRunner).toHaveBeenCalledWith({}, 'repo', 'my-org', 'my-repo', 42);
  });
});
