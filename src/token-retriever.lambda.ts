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
  /** comma separated labels the runner registers with */
  readonly labels: string;
  /** labels config.sh used to add on its own, empty when the provider turned them off. see runnerDefaultLabels() */
  readonly defaultLabels?: string[];
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

    const labels = dedupeLabels([...event.labels.split(','), ...(event.defaultLabels ?? [])]);
    let jitConfig: string;
    if (runnerLevel === 'repo') {
      jitConfig = await getJitConfigForRepo(octokit, event.owner, event.repo, event.runnerName, labels);
    } else {
      const groupId = await getRunnerGroupId(octokit, event.owner, event.group);
      jitConfig = await getJitConfigForOrg(octokit, event.owner, event.runnerName, labels, groupId);
    }
    return {
      domain: githubSecrets.domain,
      jitConfig,
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

/**
 * The JIT API wants a runner group id and not a name. Every org and repo has the default group with id 1, which is also what config.sh used when
 * no group was given.
 */
async function getRunnerGroupId(octokit: Octokit, owner: string, group: string): Promise<number> {
  if (!group) {
    return 1;
  }

  let groups: { id: number; name: string }[];
  try {
    // octokit has no typed method for this endpoint
    groups = await octokit.paginate('GET /orgs/{org}/actions/runner-groups', { org: owner, per_page: 100 });
  } catch (error) {
    throw configurationError(error, 'org', owner, '') ?? error;
  }

  const found = groups.find(g => g.name.toLowerCase() === group.toLowerCase());
  if (!found) {
    throw new RunnerConfigurationError(`Runner group "${group}" doesn't exist in organization "${owner}".`);
  }
  return found.id;
}

async function getJitConfigForOrg(octokit: Octokit, owner: string, name: string, labels: string[], groupId: number): Promise<string> {
  try {
    const response = await octokit.rest.actions.generateRunnerJitconfigForOrg({
      org: owner,
      name,
      labels,
      runner_group_id: groupId,
    });
    return response.data.encoded_jit_config;
  } catch (error) {
    throw configurationError(error, 'org', owner, '') ?? error;
  }
}

async function getJitConfigForRepo(octokit: Octokit, owner: string, repo: string, name: string, labels: string[]): Promise<string> {
  try {
    const response = await octokit.rest.actions.generateRunnerJitconfigForRepo({
      owner,
      repo,
      name,
      labels,
      runner_group_id: 1,
    });
    return response.data.encoded_jit_config;
  } catch (error) {
    throw configurationError(error, 'repo', owner, repo) ?? error;
  }
}

/**
 * Like config.sh, drop empty labels and the same label in different case.
 */
function dedupeLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  return labels.filter(l => l && !seen.has(l.toLowerCase()) && seen.add(l.toLowerCase()));
}
