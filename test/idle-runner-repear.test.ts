const mockSfnSend = jest.fn();
const mockGetOctokit = jest.fn();
const mockGetRunner = jest.fn();
const mockDeleteRunner = jest.fn();
const mockTerminateRunnerInstances = jest.fn();

jest.mock('@aws-sdk/client-sfn', () => ({
  SFNClient: jest.fn(() => ({ send: (...args: unknown[]) => mockSfnSend(...args) })),
  DescribeExecutionCommand: jest.fn(input => ({ command: 'DescribeExecution', input })),
  StopExecutionCommand: jest.fn(input => ({ command: 'StopExecution', input })),
}));

jest.mock('../src/lambda-github', () => ({
  getOctokit: (...args: unknown[]) => mockGetOctokit(...args),
  getRunner: (...args: unknown[]) => mockGetRunner(...args),
  deleteRunner: (...args: unknown[]) => mockDeleteRunner(...args),
}));

jest.mock('../src/lambda-ec2', () => ({
  terminateRunnerInstances: (...args: unknown[]) => mockTerminateRunnerInstances(...args),
}));

// Import handler after mocks are set up
import { handler } from '../src/idle-runner-repear.lambda';

const EVENT = {
  Records: [{
    messageId: 'message-1',
    body: JSON.stringify({
      executionArn: 'arn:aws:states:us-east-1:123456789012:execution:runners:runner-1',
      runnerName: 'runner-1',
      owner: 'my-org',
      repo: 'my-repo',
      installationId: 123,
      maxIdleSeconds: 300,
    }),
  }],
} as any;

const IDLE_RUNNER = { id: 42, name: 'runner-1', busy: false, labels: [{ name: 'cdkghr:started:1700000000' }] };
const BUSY_RUNNER = { ...IDLE_RUNNER, busy: true };
const FRESH_RUNNER = { ...IDLE_RUNNER, labels: [{ name: `cdkghr:started:${Math.floor(Date.now() / 1000)}` }] };

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

    expect(retried(await handler(EVENT))).toBe(false);

    expect(mockDeleteRunner).toHaveBeenCalledWith({}, 'repo', 'my-org', 'my-repo', 42);
    // there is no step function left to stop
    expect(mockSfnSend.mock.calls.map(c => c[0].command)).toEqual(['DescribeExecution']);
  });

  // we already paid to start this runner, so let GitHub have a chance to put a job on it
  test('Killed step function keeps a runner that is not idle for too long yet', async () => {
    mockSfnSend.mockResolvedValue({ status: 'FAILED', error: 'States.Runtime' });
    mockGetRunner.mockResolvedValue(FRESH_RUNNER);

    expect(retried(await handler(EVENT))).toBe(true);

    expect(mockDeleteRunner).not.toHaveBeenCalled();
  });

  // a stopped step function runs no cleaners, so this message is the only thing that can ever terminate the instance
  // behind this runner once it finishes its job. dropping it would leave a failed poweroff running forever
  test('Stopped step function keeps watching a busy runner', async () => {
    mockSfnSend.mockResolvedValue({ status: 'ABORTED' });
    mockGetRunner.mockResolvedValue(BUSY_RUNNER);

    expect(retried(await handler(EVENT))).toBe(true);

    expect(mockDeleteRunner).not.toHaveBeenCalled();
    // nothing to terminate yet - it is still running a job
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

    expect(retried(await handler(EVENT))).toBe(true);
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

    expect(retried(await handler(EVENT))).toBe(false);

    expect(mockSfnSend.mock.calls.map(c => c[0].command)).toEqual(['DescribeExecution', 'StopExecution']);
    expect(mockDeleteRunner).toHaveBeenCalledWith({}, 'repo', 'my-org', 'my-repo', 42);
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

  // StopExecution skips the step function's catchers, so the reaper has to clean up the instance it just orphaned
  test('Terminates the instance behind a reaped idle runner', async () => {
    mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
    mockGetRunner.mockResolvedValue(IDLE_RUNNER);
    mockDeleteRunner.mockResolvedValue(undefined);

    const result = await handler(EVENT);

    expect(retried(result)).toBe(false);
    expect(mockDeleteRunner).toHaveBeenCalled();
    expect(mockTerminateRunnerInstances).toHaveBeenCalledWith('runner-1');
  });

  test('Leaves a busy runner alone', async () => {
    mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
    mockGetRunner.mockResolvedValue(BUSY_RUNNER);

    await handler(EVENT);

    expect(mockTerminateRunnerInstances).not.toHaveBeenCalled();
  });

  // the idle timeout hasn't been reached, so the runner is still allowed to pick up a job
  test('Leaves a freshly started idle runner alone', async () => {
    mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
    mockGetRunner.mockResolvedValue(FRESH_RUNNER);

    await handler(EVENT);

    expect(mockDeleteRunner).not.toHaveBeenCalled();
    expect(mockTerminateRunnerInstances).not.toHaveBeenCalled();
  });
});
