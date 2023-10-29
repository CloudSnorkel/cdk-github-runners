import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { getSecretValue, getSecretJsonValue } from './lambda-helpers';

export function baseUrlFromDomain(domain: string): string {
  if (domain == 'github.com') {
    return 'https://api.github.com';
  }
  return `https://${domain}/api/v3`;
}

type RunnerLevel = 'repo' | 'org' | undefined; // undefined is for backwards compatibility and should be treated as 'repo'

export interface GitHubSecrets {
  domain: string;
  appId: number;
  personalAuthToken: string;
  runnerLevel: RunnerLevel;
}

const octokitCache: {
  installationId?: number;
  secrets?: GitHubSecrets;
  octokit?: Octokit;
} = {};

export async function getOctokit(installationId?: number): Promise<{ octokit: Octokit; githubSecrets: GitHubSecrets }> {
  if (!process.env.GITHUB_SECRET_ARN || !process.env.GITHUB_PRIVATE_KEY_SECRET_ARN) {
    throw new Error('Missing environment variables');
  }

  const githubSecrets: GitHubSecrets = await getSecretJsonValue(process.env.GITHUB_SECRET_ARN);

  if (octokitCache.octokit && octokitCache.installationId == installationId && octokitCache.secrets &&
    octokitCache.secrets.domain == githubSecrets.domain && octokitCache.secrets.appId == githubSecrets.appId &&
    octokitCache.secrets.personalAuthToken == githubSecrets.personalAuthToken) {
    // test and use cache
    try {
      await octokitCache.octokit.rest.meta.getOctocat();
      console.log('Using cached octokit');
      return {
        octokit: octokitCache.octokit,
        githubSecrets: octokitCache.secrets,
      };
    } catch (e) {
      console.log('Octokit cache is invalid', e);
      octokitCache.octokit = undefined;
    }
  }

  let baseUrl = baseUrlFromDomain(githubSecrets.domain);

  let token;
  if (githubSecrets.personalAuthToken) {
    token = githubSecrets.personalAuthToken;
  } else {
    const privateKey = await getSecretValue(process.env.GITHUB_PRIVATE_KEY_SECRET_ARN);

    const appOctokit = new Octokit({
      baseUrl,
      authStrategy: createAppAuth,
      auth: {
        appId: githubSecrets.appId,
        privateKey: privateKey,
      },
    });

    token = (await appOctokit.auth({
      type: 'installation',
      installationId: installationId,
    }) as any).token;
  }

  const octokit = new Octokit({
    baseUrl,
    auth: token,
  });

  octokitCache.octokit = octokit;
  octokitCache.installationId = installationId;
  octokitCache.secrets = githubSecrets;

  return {
    octokit,
    githubSecrets,
  };
}

export async function getRunner(octokit: Octokit, runnerLevel: RunnerLevel, owner: string, repo: string, name: string) {
  let page = 1;
  while (true) {
    let runners;

    if ((runnerLevel ?? 'repo') === 'repo') {
      runners = await octokit.rest.actions.listSelfHostedRunnersForRepo({
        page: page,
        owner: owner,
        repo: repo,
      });
    } else {
      runners = await octokit.rest.actions.listSelfHostedRunnersForOrg({
        page: page,
        org: owner,
      });
    }

    if (runners.data.runners.length == 0) {
      return;
    }

    for (const runner of runners.data.runners) {
      if (runner.name == name) {
        return runner;
      }
    }

    page++;
  }
}

export async function deleteRunner(octokit: Octokit, runnerLevel: RunnerLevel, owner: string, repo: string, runnerId: number) {
  if ((runnerLevel ?? 'repo') === 'repo') {
    await octokit.rest.actions.deleteSelfHostedRunnerFromRepo({
      owner: owner,
      repo: repo,
      runner_id: runnerId,
    });
  } else {
    await octokit.rest.actions.deleteSelfHostedRunnerFromOrg({
      org: owner,
      runner_id: runnerId,
    });
  }
}
