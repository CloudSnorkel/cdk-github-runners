import { createHash } from 'crypto';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { getSecretJsonValue, getSecretValue } from './lambda-helpers';

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

const octokitCache = new Map<string, Octokit>();

export async function getOctokit(installationId?: number): Promise<{ octokit: Octokit; githubSecrets: GitHubSecrets }> {
  if (!process.env.GITHUB_SECRET_ARN || !process.env.GITHUB_PRIVATE_KEY_SECRET_ARN) {
    throw new Error('Missing environment variables');
  }

  const githubSecrets: GitHubSecrets = await getSecretJsonValue(process.env.GITHUB_SECRET_ARN);

  // Create cache key from installation ID and secrets (hash to avoid exposing sensitive data by accident)
  const cacheKey = createHash('sha256').update(`${installationId || 'no-install'}-${githubSecrets.domain}-${githubSecrets.appId}-${githubSecrets.personalAuthToken}`).digest('hex');

  const cached = octokitCache.get(cacheKey);
  if (cached) {
    try {
      // Test if the cached octokit is still valid
      await cached.rest.meta.getOctocat();
      console.log({
        notice: 'Using cached octokit',
      });
      return {
        octokit: cached,
        githubSecrets,
      };
    } catch (e) {
      console.log({
        notice: 'Octokit cache is invalid',
        error: e,
      });
      octokitCache.delete(cacheKey);
    }
  }

  const baseUrl = baseUrlFromDomain(githubSecrets.domain);

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

  // Store in cache
  octokitCache.set(cacheKey, octokit);

  return {
    octokit,
    githubSecrets,
  };
}

// This function is used to get the Octokit instance for the app itself, not for a specific installation.
// With PAT authentication, it returns undefined.
export async function getAppOctokit() {
  if (!process.env.GITHUB_SECRET_ARN || !process.env.GITHUB_PRIVATE_KEY_SECRET_ARN) {
    throw new Error('Missing environment variables');
  }

  const githubSecrets: GitHubSecrets = await getSecretJsonValue(process.env.GITHUB_SECRET_ARN);
  const baseUrl = baseUrlFromDomain(githubSecrets.domain);

  if (githubSecrets.personalAuthToken || !githubSecrets.appId) {
    return undefined;
  }

  const privateKey = await getSecretValue(process.env.GITHUB_PRIVATE_KEY_SECRET_ARN);

  return new Octokit({
    baseUrl,
    authStrategy: createAppAuth,
    auth: {
      appId: githubSecrets.appId,
      privateKey: privateKey,
    },
  });
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

export async function redeliver(octokit: Octokit, deliveryId: number): Promise<void> {
  const response = await octokit.rest.apps.redeliverWebhookDelivery({
    delivery_id: deliveryId,
  });

  if (response.status !== 202) {
    throw new Error(`Failed to redeliver webhook delivery with ID ${deliveryId}`);
  }
  console.log({
    notice: 'Successfully redelivered webhook delivery',
    deliveryId,
  });
}
