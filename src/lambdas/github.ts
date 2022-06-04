/* eslint-disable import/no-extraneous-dependencies */
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/core';
import { getSecretValue, getSecretJsonValue } from './helpers';

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