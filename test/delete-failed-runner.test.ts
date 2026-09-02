const mockGetOctokit = jest.fn();
const mockGetRunner = jest.fn();
const mockDeleteRunner = jest.fn();

jest.mock('../src/lambda-github', () => ({
  getOctokit: (...args: unknown[]) => mockGetOctokit(...args),
  getRunner: (...args: unknown[]) => mockGetRunner(...args),
  deleteRunner: (...args: unknown[]) => mockDeleteRunner(...args),
}));

// Import handler after mocks are set up
import { handler } from '../src/delete-failed-runner.lambda';

const EVENT = {
  owner: 'my-org',
  repo: 'my-repo',
  runnerName: 'runner-1',
  installationId: 123,
};

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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Deletes the runner when it is still registered', async () => {
    mockGetRunner.mockResolvedValue(RUNNER);
    mockDeleteRunner.mockResolvedValue(undefined);

    await expect(handler(EVENT)).resolves.toEqual({ runnerFound: true, runnerDeleted: true });

    expect(mockDeleteRunner).toHaveBeenCalledWith({}, 'repo', 'my-org', 'my-repo', 42);
  });

  // the step function fails the execution with a separate `Rethrow Error` state, so a missing runner -- which is the
  // common case -- must not fail this Lambda
  test('Succeeds when the runner is already gone', async () => {
    mockGetRunner.mockResolvedValue(undefined);

    await expect(handler(EVENT)).resolves.toEqual({ runnerFound: false, runnerDeleted: false });

    expect(mockDeleteRunner).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  test('Succeeds but reports the runner was not deleted when GitHub rejects the delete', async () => {
    mockGetRunner.mockResolvedValue(RUNNER);
    mockDeleteRunner.mockRejectedValue(new Error('Internal server error'));

    await expect(handler(EVENT)).resolves.toEqual({ runnerFound: true, runnerDeleted: false });

    expect(console.error).toHaveBeenCalled();
  });

  // this one the step function does need to see, so it can retry until the job lets go of the runner
  test('Fails with RunnerBusy when the runner is still running a job', async () => {
    mockGetRunner.mockResolvedValue(RUNNER);
    mockDeleteRunner.mockRejectedValue(new Error('Bad request - runner "runner-1" is still running a job'));

    await expect(handler(EVENT)).rejects.toMatchObject({ name: 'RunnerBusy' });
  });
});
