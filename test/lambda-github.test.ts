import { GITHUB_PRIVATE_KEY_PLACEHOLDER } from '../src/lambda-common';
import { checkAppAuth, checkPrivateKey, GitHubSecrets } from '../src/lambda-github';

function secrets(overrides: Partial<GitHubSecrets> = {}): GitHubSecrets {
  return {
    domain: 'github.com',
    appId: 1234,
    personalAuthToken: '',
    runnerLevel: 'repo',
    ...overrides,
  };
}

describe('GitHub configuration checks', () => {
  test('no authentication set up at all', () => {
    expect(() => checkAppAuth(secrets({ appId: 0 }), 1)).toThrow(expect.objectContaining({
      name: 'RunnerConfigurationError',
      message: expect.stringContaining('has not been set up'),
    }));
  });

  test('app authentication without an installation id', () => {
    expect(() => checkAppAuth(secrets(), undefined)).toThrow(expect.objectContaining({
      name: 'RunnerConfigurationError',
      message: expect.stringContaining('Installation ID is required'),
    }));
  });

  test('app authentication with an installation id is fine', () => {
    expect(() => checkAppAuth(secrets(), 1)).not.toThrow();
  });

  test('private key secret still has the placeholder we deploy with', () => {
    expect(() => checkPrivateKey(`${GITHUB_PRIVATE_KEY_PLACEHOLDER}\n`)).toThrow(expect.objectContaining({
      name: 'RunnerConfigurationError',
      message: expect.stringContaining('private key has not been set'),
    }));
  });

  test('a real private key is fine', () => {
    expect(() => checkPrivateKey('-----BEGIN RSA PRIVATE KEY-----\nabcd\n-----END RSA PRIVATE KEY-----')).not.toThrow();
  });
});
