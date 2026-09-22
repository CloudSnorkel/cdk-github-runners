import type { Octokit } from '@octokit/rest' with { 'resolution-mode': 'import' };
import { getOctokit, RunnerLevel } from './lambda-github';
import { RunnerConfigurationError, StepFunctionLambdaInput } from './lambda-helpers';

class RunnerTokenError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'RunnerTokenError';
    Object.setPrototypeOf(this, RunnerTokenError.prototype);
  }
}

/**
 * @internal
 */
export interface TokenRetrieverInput extends StepFunctionLambdaInput {
  /** runner group of the config the orchestrator selected, empty when it has none */
  readonly group: string;
}

export async function handler(event: TokenRetrieverInput) {
  try {
    const {
      githubSecrets,
      octokit,
    } = await getOctokit(event.installationId);

    const runnerLevel = githubSecrets.runnerLevel ?? 'repo'; // undefined is for backwards compatibility

    if (runnerLevel !== 'repo' && runnerLevel !== 'org') {
      throw new RunnerConfigurationError(`Invalid runner level "${runnerLevel}" in the GitHub secret. It must be either "repo" or "org".`);
    }

    // runner groups only exist for organizations. a runner registered on repository level with --runnergroup fails
    // with "Could not find any self-hosted runner group named ...", but only after it's already running.
    if (event.group && runnerLevel === 'repo') {
      throw new RunnerConfigurationError(
        `Runner group "${event.group}" is configured, but runners are registered on repository level. Runner groups are ` +
        'only available for runners registered on organization level. Either remove the group from the provider, or ' +
        're-run the setup wizard and register runners on organization level.');
    }

    let token: string;
    let registrationUrl: string;
    if (runnerLevel === 'repo') {
      token = await getRegistrationTokenForRepo(octokit, event.owner, event.repo);
      registrationUrl = `https://${githubSecrets.domain}/${event.owner}/${event.repo}`;
    } else {
      token = await getRegistrationTokenForOrg(octokit, event.owner);
      registrationUrl = `https://${githubSecrets.domain}/${event.owner}`;
    }
    return {
      domain: githubSecrets.domain,
      token,
      registrationUrl,
    };
  } catch (error) {
    console.error({
      notice: 'Failed to retrieve runner registration token',
      owner: event.owner,
      repo: event.repo,
      runnerName: event.runnerName,
      error: `${error}`,
    });
    if (error instanceof RunnerConfigurationError) {
      // keep configuration errors as-is so the step function says what needs fixing instead of just "token error"
      throw error;
    }
    throw new RunnerTokenError((<Error>error).message);
  }
}

/**
 * GitHub answers a rate limit with 403 too. That one is temporary and worth retrying, so it must not be mistaken for a permissions problem.
 */
function isRateLimited(error: any): boolean {
  return error?.response?.headers?.['x-ratelimit-remaining'] === '0' || /rate limit/i.test(error?.message ?? '');
}

/**
 * Turn the way GitHub refuses to give us a registration token into something the user can act on. These all mean the
 * setup is wrong, so no runner will ever start until it's fixed, and there's no point starting one to find out.
 *
 * Anything we don't recognize gets reported as a regular runner token error instead.
 */
function configurationError(error: any, runnerLevel: RunnerLevel, owner: string, repo: string): RunnerConfigurationError | undefined {
  const target = runnerLevel === 'org' ? `organization "${owner}"` : `repository "${owner}/${repo}"`;
  // GitHub's own message often names the exact missing permission, so it's worth keeping around
  const said = error?.message ? ` GitHub said: "${error.message}"` : '';
  const docs = ' See https://github.com/CloudSnorkel/cdk-github-runners/blob/main/SETUP_GITHUB.md';

  if (isRateLimited(error)) {
    return undefined;
  }

  switch (error?.status) {
    case 401:
      return new RunnerConfigurationError(`GitHub rejected our credentials while registering a runner for ${target} (401). The personal access ` +
        'token may be expired or revoked, or the app private key may not match the app id.' + docs + said);
    case 403:
      return new RunnerConfigurationError(`GitHub denied us permission to register a runner for ${target} (403). Personal access tokens need ` +
        `${runnerLevel === 'org' ? 'the admin:org scope' : 'the repo scope'}, and apps need ` +
        `${runnerLevel === 'org' ? 'the organization_self_hosted_runners permission' : 'the administration permission'}.` + docs + said);
    case 404:
      return new RunnerConfigurationError(`GitHub has no ${target}, or we have no access to it (404). ` +
        (runnerLevel === 'org'
          ? 'Runners are registered on organization level, so jobs from user accounts and from other organizations can\'t get a runner. ' +
            'Re-run the setup wizard to register runners on repository level if that\'s what you need.'
          : 'Confirm the app is installed on this repository, or that the personal access token can access it.') + said);
    default:
      return undefined;
  }
}

async function getRegistrationTokenForOrg(octokit: Octokit, owner: string): Promise<string> {
  try {
    const response = await octokit.rest.actions.createRegistrationTokenForOrg({
      org: owner,
    });
    return response.data.token;
  } catch (error) {
    throw configurationError(error, 'org', owner, '') ?? error;
  }
}

async function getRegistrationTokenForRepo(octokit: Octokit, owner: string, repo: string): Promise<string> {
  try {
    const response = await octokit.rest.actions.createRegistrationTokenForRepo({
      owner: owner,
      repo: repo,
    });
    return response.data.token;
  } catch (error) {
    throw configurationError(error, 'repo', owner, repo) ?? error;
  }
}
