const mockGetOctokit = jest.fn();
const mockGetRunner = jest.fn();
const mockDeleteRunner = jest.fn();
const mockTerminateRunnerInstances = jest.fn();

jest.mock('../src/lambda-github', () => ({
  getOctokit: (...args: unknown[]) => mockGetOctokit(...args),
  getRunner: (...args: unknown[]) => mockGetRunner(...args),
  deleteRunner: (...args: unknown[]) => mockDeleteRunner(...args),
}));

jest.mock('../src/lambda-ec2', () => ({
  terminateRunnerInstances: (...args: unknown[]) => mockTerminateRunnerInstances(...args),
}));

// Import handler after mocks are set up
import { handler } from '../src/delete-failed-runner.lambda';

const EVENT = {
  owner: 'my-org',
  repo: 'my-repo',
  runnerName: 'runner-1',
  installationId: 123,
};

const EC2_EVENT = { ...EVENT, family: 'ec2' };

const RUNNER = { id: 42, name: 'runner-1' };

describe('delete-failed-runner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
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

  test('Deletes the runner when it is still registered', async () => {
    mockGetRunner.mockResolvedValue(RUNNER);
    mockDeleteRunner.mockResolvedValue(undefined);

    await expect(handler(EVENT)).resolves.toEqual({ runnerFound: true, runnerDeleted: true, instancesTerminated: [] });

    expect(mockDeleteRunner).toHaveBeenCalledWith({}, 'repo', 'my-org', 'my-repo', 42);
  });

  // the step function fails the execution with a separate `Rethrow Error` state, so a missing runner -- which is the
  // common case -- must not fail this Lambda
  test('Succeeds when the runner is already gone', async () => {
    mockGetRunner.mockResolvedValue(undefined);

    await expect(handler(EVENT)).resolves.toEqual({ runnerFound: false, runnerDeleted: false, instancesTerminated: [] });

    expect(mockDeleteRunner).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  test('Succeeds but reports the runner was not deleted when GitHub rejects the delete', async () => {
    mockGetRunner.mockResolvedValue(RUNNER);
    mockDeleteRunner.mockRejectedValue(new Error('Internal server error'));

    await expect(handler(EVENT)).resolves.toEqual({ runnerFound: true, runnerDeleted: false, instancesTerminated: [] });

    expect(console.error).toHaveBeenCalled();
  });

  // this one the step function does need to see, so it can retry until the job lets go of the runner
  test('Fails with RunnerBusy when the runner is still running a job', async () => {
    mockGetRunner.mockResolvedValue(RUNNER);
    mockDeleteRunner.mockRejectedValue(new Error('Bad request - runner "runner-1" is still running a job'));

    await expect(handler(EVENT)).rejects.toMatchObject({ name: 'RunnerBusy' });
  });

  // an EC2 runner whose user data never ran never registers, so this is the path that cleans up after a boot that
  // never reached `poweroff`
  test('Terminates leftover instances when the runner never registered', async () => {
    mockGetRunner.mockResolvedValue(undefined);
    mockTerminateRunnerInstances.mockResolvedValue(['i-123']);

    await expect(handler(EC2_EVENT)).resolves.toEqual({ runnerFound: false, runnerDeleted: false, instancesTerminated: ['i-123'] });

    expect(mockTerminateRunnerInstances).toHaveBeenCalledWith('runner-1');
  });

  // the runner registered, so the instance booted fine and will notice the deregistration and power itself off.
  // terminating now would cut its logs off mid-line. the idle reaper picks it up later if it doesn't go away
  test('Leaves the instance alone after deleting a live runner', async () => {
    mockGetRunner.mockResolvedValue(RUNNER);
    mockDeleteRunner.mockResolvedValue(undefined);

    await expect(handler(EC2_EVENT)).resolves.toEqual({ runnerFound: true, runnerDeleted: true, instancesTerminated: [] });

    expect(mockTerminateRunnerInstances).not.toHaveBeenCalled();
  });

  test('Leaves the instance alone when the runner was found but could not be deleted', async () => {
    mockGetRunner.mockResolvedValue(RUNNER);
    mockDeleteRunner.mockRejectedValue(new Error('Internal server error'));

    await expect(handler(EC2_EVENT)).resolves.toEqual({ runnerFound: true, runnerDeleted: false, instancesTerminated: [] });

    expect(mockTerminateRunnerInstances).not.toHaveBeenCalled();
  });

  // GitHub says a job is still running on this runner. the task token is dead, but that job's instance is the one we
  // would be killing, so the retry has to play out instead
  test('Does not terminate anything while the runner is still busy', async () => {
    mockGetRunner.mockResolvedValue(RUNNER);
    mockDeleteRunner.mockRejectedValue(new Error('Bad request - runner "runner-1" is still running a job'));

    await expect(handler(EVENT)).rejects.toMatchObject({ name: 'RunnerBusy' });

    expect(mockTerminateRunnerInstances).not.toHaveBeenCalled();
  });

  // every other provider is managed by AWS, so there is never an instance to look for. a fallback chain hits this
  // Lambda once per attempt, so an unnecessary lookup here is paid repeatedly
  // these all go through the no-runner path, because that is the only one that looks for instances at all now. a
  // registered runner would skip regardless of family and the test would pass for the wrong reason
  test('Skips the EC2 lookup for a family that cannot leave an instance behind', async () => {
    mockGetRunner.mockResolvedValue(undefined);

    await expect(handler({ ...EVENT, family: 'fargate' })).resolves.toEqual({
      runnerFound: false, runnerDeleted: false, instancesTerminated: [],
    });

    expect(mockTerminateRunnerInstances).not.toHaveBeenCalled();
  });

  test('Looks for instances when the family that was tried is ec2', async () => {
    mockGetRunner.mockResolvedValue(undefined);
    mockTerminateRunnerInstances.mockResolvedValue(['i-123']);

    await expect(handler({ ...EVENT, family: 'ec2' })).resolves.toEqual({
      runnerFound: false, runnerDeleted: false, instancesTerminated: ['i-123'],
    });
  });

  // executions already running when this deploys were started by a step function that doesn't send a family, so they
  // get no clean-up. that window is short and this is best effort, so we don't spend an EC2 call guessing
  test('Skips the EC2 lookup when the family is unknown', async () => {
    mockGetRunner.mockResolvedValue(undefined);

    await handler(EVENT);

    expect(mockTerminateRunnerInstances).not.toHaveBeenCalled();
  });

  // a runner that never registered is the failed-boot case, and it still needs the instance cleaned up
  test('Skips the EC2 lookup for a non-EC2 family even when no runner registered', async () => {
    mockGetRunner.mockResolvedValue(undefined);

    await expect(handler({ ...EVENT, family: 'lambda' })).resolves.toEqual({
      runnerFound: false, runnerDeleted: false, instancesTerminated: [],
    });

    expect(mockTerminateRunnerInstances).not.toHaveBeenCalled();
  });
});
