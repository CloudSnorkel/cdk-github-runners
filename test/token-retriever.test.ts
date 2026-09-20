const mockGetOctokit = jest.fn();

jest.mock('../src/lambda-github', () => ({
  getOctokit: (...args: unknown[]) => mockGetOctokit(...args),
}));

// Import handler after mocks are set up
import { handler } from '../src/token-retriever.lambda';

function createEvent(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'my-org',
    repo: 'my-repo',
    runnerName: 'runner-1',
    installationId: 1,
    group: '',
    ...overrides,
  } as any;
}

type TokenError = { status: number; message?: string; headers?: Record<string, string> };

function createOctokit(runnerLevel: string | undefined, tokenError?: number | TokenError) {
  const spec = typeof tokenError === 'number' ? { status: tokenError } : tokenError;
  const registrationToken = (token: string) => spec === undefined
    ? jest.fn().mockResolvedValue({ data: { token } })
    : jest.fn().mockRejectedValue(Object.assign(new Error(spec.message ?? 'GitHub says no'), {
      status: spec.status,
      response: { headers: spec.headers ?? {} },
    }));

  return {
    octokit: {
      rest: {
        actions: {
          createRegistrationTokenForOrg: registrationToken('org-token'),
          createRegistrationTokenForRepo: registrationToken('repo-token'),
        },
      },
    },
    githubSecrets: {
      domain: 'github.com',
      runnerLevel,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Runner token retriever', () => {
  test('repo level registration returns a repo token', async () => {
    mockGetOctokit.mockResolvedValue(createOctokit('repo'));

    await expect(handler(createEvent())).resolves.toEqual({
      domain: 'github.com',
      token: 'repo-token',
      registrationUrl: 'https://github.com/my-org/my-repo',
    });
  });

  test('org level registration returns an org token', async () => {
    mockGetOctokit.mockResolvedValue(createOctokit('org'));

    await expect(handler(createEvent())).resolves.toEqual({
      domain: 'github.com',
      token: 'org-token',
      registrationUrl: 'https://github.com/my-org',
    });
  });

  test('undefined runner level is still treated as repo level', async () => {
    mockGetOctokit.mockResolvedValue(createOctokit(undefined));

    await expect(handler(createEvent())).resolves.toMatchObject({ token: 'repo-token' });
  });

  test('runner group with org level registration starts the runner', async () => {
    mockGetOctokit.mockResolvedValue(createOctokit('org'));

    await expect(handler(createEvent({ group: 'my-group' }))).resolves.toMatchObject({ token: 'org-token' });
  });

  test('runner group with repo level registration fails with a configuration error', async () => {
    mockGetOctokit.mockResolvedValue(createOctokit('repo'));

    await expect(handler(createEvent({ group: 'my-group' }))).rejects.toMatchObject({
      name: 'RunnerConfigurationError',
      message: expect.stringContaining('my-group'),
    });
  });

  test('runner group with backwards compatible undefined runner level fails too', async () => {
    mockGetOctokit.mockResolvedValue(createOctokit(undefined));

    await expect(handler(createEvent({ group: 'my-group' }))).rejects.toMatchObject({
      name: 'RunnerConfigurationError',
    });
  });

  test('invalid runner level fails with a configuration error', async () => {
    mockGetOctokit.mockResolvedValue(createOctokit('enterprise'));

    await expect(handler(createEvent())).rejects.toMatchObject({
      name: 'RunnerConfigurationError',
      message: expect.stringContaining('enterprise'),
    });
  });

  test('rejected credentials fail with a configuration error', async () => {
    mockGetOctokit.mockResolvedValue(createOctokit('repo', 401));

    await expect(handler(createEvent())).rejects.toMatchObject({
      name: 'RunnerConfigurationError',
      message: expect.stringContaining('401'),
    });
  });

  test('missing permissions name the scope needed for the runner level', async () => {
    mockGetOctokit.mockResolvedValue(createOctokit('org', 403));

    await expect(handler(createEvent())).rejects.toMatchObject({
      name: 'RunnerConfigurationError',
      message: expect.stringContaining('admin:org'),
    });
  });

  test('a repo we cannot see explains what to check for repo level registration', async () => {
    mockGetOctokit.mockResolvedValue(createOctokit('repo', 404));

    await expect(handler(createEvent())).rejects.toMatchObject({
      name: 'RunnerConfigurationError',
      message: expect.stringContaining('repository "my-org/my-repo"'),
    });
  });

  test('a missing org explains that org level registration only covers that org', async () => {
    mockGetOctokit.mockResolvedValue(createOctokit('org', 404));

    await expect(handler(createEvent())).rejects.toMatchObject({
      name: 'RunnerConfigurationError',
      message: expect.stringContaining('organization level'),
    });
  });

  test('configuration errors keep what GitHub said', async () => {
    mockGetOctokit.mockResolvedValue(createOctokit('repo', { status: 403, message: 'Resource not accessible by integration' }));

    await expect(handler(createEvent())).rejects.toMatchObject({
      name: 'RunnerConfigurationError',
      message: expect.stringContaining('Resource not accessible by integration'),
    });
  });

  test('a rate limited 403 is a token error, not a configuration error', async () => {
    mockGetOctokit.mockResolvedValue(createOctokit('repo', {
      status: 403,
      message: 'API rate limit exceeded',
      headers: { 'x-ratelimit-remaining': '0' },
    }));

    await expect(handler(createEvent())).rejects.toMatchObject({
      name: 'RunnerTokenError',
      message: 'API rate limit exceeded',
    });
  });

  test('a secondary rate limit without headers is still a token error', async () => {
    mockGetOctokit.mockResolvedValue(createOctokit('org', {
      status: 403,
      message: 'You have exceeded a secondary rate limit',
    }));

    await expect(handler(createEvent())).rejects.toMatchObject({
      name: 'RunnerTokenError',
    });
  });

  test('unexpected GitHub errors are still reported as token errors', async () => {
    mockGetOctokit.mockResolvedValue(createOctokit('repo', 500));

    await expect(handler(createEvent())).rejects.toMatchObject({
      name: 'RunnerTokenError',
      message: 'GitHub says no',
    });
  });

  test('other errors are still reported as token errors', async () => {
    mockGetOctokit.mockRejectedValue(new Error('GitHub is down'));

    await expect(handler(createEvent())).rejects.toMatchObject({
      name: 'RunnerTokenError',
      message: 'GitHub is down',
    });
  });
});
