/* eslint-disable import/no-extraneous-dependencies */
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { getSecretValue, getSecretJsonValue } from './lambda-helpers';

export function baseUrlFromDomain(domain: string): string {
  if (domain == 'github.com') {
    return 'https://api.github.com';
  }
  return `https://${domain}/api/v3`;
}

export async function getOctokit(installationId?: string) {
  if (!process.env.GITHUB_SECRET_ARN || !process.env.GITHUB_PRIVATE_KEY_SECRET_ARN) {
    throw new Error('Missing environment variables');
  }

  const githubSecrets = await getSecretJsonValue(process.env.GITHUB_SECRET_ARN);

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

  return {
    githubSecrets,
    octokit,
  };
}

interface GitHubRunner {
  readonly id: number;
  readonly name: string;
  readonly os: string;
  readonly status: string;
  readonly busy: boolean;
  readonly labels: {
    readonly id: number;
    readonly name: string;
    readonly type: string;
  }[];
}

export async function getRunner(octokit: any, owner: string, repo: string, name: string): Promise<GitHubRunner | undefined> {
  let page = 1;
  while (true) {
    const runners = await octokit.request('GET /repos/{owner}/{repo}/actions/runners?per_page=100&page={page}', {
      page: page,
      owner: owner,
      repo: repo,
    });

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
