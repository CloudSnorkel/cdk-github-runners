/* eslint-disable import/no-extraneous-dependencies */
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/core';
import * as AWS from 'aws-sdk';
import { baseUrlFromDomain } from '../github';

const sm = new AWS.SecretsManager();
const sf = new AWS.StepFunctions();

function secretArnToUrl(arn: string) {
  const parts = arn.split(':'); // arn:aws:secretsmanager:us-east-1:12345678:secret:secret-name-REVISION
  const region = parts[3];
  const fullName = parts[6];
  const name = fullName.slice(0, fullName.lastIndexOf('-'));

  return `https://${region}.console.aws.amazon.com/secretsmanager/home?region=${region}#!/secret?name=${name}`;
}

function lambdaArnToUrl(arn: string) {
  const parts = arn.split(':'); // arn:aws:lambda:us-east-1:12345678:function:name-XYZ
  const region = parts[3];
  const name = parts[6];

  return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${name}?tab=monitoring`;
}

function stepFunctionArnToUrl(arn: string) {
  const parts = arn.split(':'); // arn:aws:states:us-east-1:12345678:stateMachine:name-XYZ
  const region = parts[3];

  return `https://${region}.console.aws.amazon.com/states/home?region=${region}#/statemachines/view/${arn}`;
}

interface AppInstallation {
  readonly id: number;
  readonly url: string;
  readonly status: string;
  readonly repositories: string[];
}

interface RecentRun {
  readonly owner?: string;
  readonly repo?: string;
  readonly runId?: string;
  readonly executionArn?: string;
  readonly status: string;
}

exports.handler = async function () {
  // confirm required environment vairables
  if (!process.env.WEBHOOK_SECRET_ARN || !process.env.GITHUB_SECRET_ARN || !process.env.GITHUB_PRIVATE_KEY_SECRET_ARN || !process.env.PROVIDERS ||
      !process.env.WEBHOOK_HANDLER_ARN || !process.env.STEP_FUNCTION_ARN) {
    throw new Error('Missing environment variables');
  }

  // base status
  const status = {
    github: {
      domain: 'Unknown',
      webhook: {
        url: process.env.WEBHOOK_URL,
        status: 'Unable to check',
        secretArn: process.env.WEBHOOK_SECRET_ARN,
        secretUrl: secretArnToUrl(process.env.WEBHOOK_SECRET_ARN),
      },
      auth: {
        type: 'Unknown',
        status: 'Unknown',
        secretArn: process.env.GITHUB_SECRET_ARN,
        secretUrl: secretArnToUrl(process.env.GITHUB_SECRET_ARN),
        privateKeySecretArn: process.env.GITHUB_PRIVATE_KEY_SECRET_ARN,
        privateKeySecretUrl: secretArnToUrl(process.env.GITHUB_PRIVATE_KEY_SECRET_ARN),
        app: {
          id: '',
          url: '',
          installations: [] as AppInstallation[],
        },
        personalAuthToken: '',
      },
    },
    providers: JSON.parse(process.env.PROVIDERS),
    troubleshooting: {
      webhookHandlerArn: process.env.WEBHOOK_HANDLER_ARN,
      webhookHandlerUrl: lambdaArnToUrl(process.env.WEBHOOK_HANDLER_ARN),
      stepFunctionArn: process.env.STEP_FUNCTION_ARN,
      stepFunctionUrl: stepFunctionArnToUrl(process.env.STEP_FUNCTION_ARN),
      recentRuns: [] as RecentRun[],
    },
  };

  // list last 10 executions and their status
  try {
    const executions = await sf.listExecutions({
      stateMachineArn: process.env.STEP_FUNCTION_ARN,
      maxResults: 10,
    }).promise();
    for (const execution of executions.executions) {
      const executionDetails = await sf.describeExecution({
        executionArn: execution.executionArn,
      }).promise();
      const input = JSON.parse(executionDetails.input || '{}');

      status.troubleshooting.recentRuns.push({
        executionArn: execution.executionArn,
        status: execution.status,
        owner: input.owner,
        repo: input.repo,
        runId: input.runId,
      });
    }
  } catch (e) {
    status.troubleshooting.recentRuns.push({ status: `Error getting executions: ${e}` });
  }

  // get secrets
  let githubSecrets;
  try {
    const secret = await sm.getSecretValue({
      SecretId: process.env.GITHUB_SECRET_ARN,
    }).promise();
    if (!secret.SecretString) {
      status.github.auth.status = 'GitHub Secret has no SecretString';
      return status;
    }
    githubSecrets = JSON.parse(secret.SecretString);
  } catch (e) {
    status.github.auth.status = `Unable to read secret: ${e}`;
    return status;
  }

  let privateKey;
  try {
    privateKey = (await sm.getSecretValue({
      SecretId: process.env.GITHUB_PRIVATE_KEY_SECRET_ARN,
    }).promise()).SecretString;
  } catch (e) {
    status.github.auth.status = `Unable to read private key secret: ${e}`;
    return status;
  }

  // calculate base url
  let baseUrl = baseUrlFromDomain(githubSecrets.domain);
  status.github.domain = githubSecrets.domain;

  if (githubSecrets.personalAuthToken) {
    // try authenticating with personal authentication token
    status.github.auth.type = 'Personal Auth Token';
    status.github.auth.personalAuthToken = '*redacted*';

    let octokit;
    try {
      octokit = new Octokit({ baseUrl, auth: githubSecrets.personalAuthToken });
    } catch (e) {
      status.github.auth.status = `Unable to authenticate using personal auth token: ${e}`;
      return status;
    }

    try {
      const user = await octokit.request('GET /user');
      status.github.auth.personalAuthToken = `username: ${user.data.login}`;
    } catch (e) {
      status.github.auth.status = `Unable to call /user with personal auth token: ${e}`;
      return status;
    }

    status.github.auth.status = 'OK';
    status.github.webhook.status = 'Unable to verify automatically';
  } else {
    // try authenticating with GitHub app
    status.github.auth.type = 'GitHub App';
    status.github.auth.app.id = githubSecrets.appId;

    let appOctokit;
    try {
      appOctokit = new Octokit({
        baseUrl,
        authStrategy: createAppAuth,
        auth: {
          appId: githubSecrets.appId,
          privateKey: privateKey,
        },
      });
    } catch (e) {
      status.github.auth.status = `Unable to authenticate app: ${e}`;
      return status;
    }

    // get app url
    try {
      const app = (await appOctokit.request('GET /app')).data;
      status.github.auth.app.url = app.html_url;
    } catch (e) {
      status.github.auth.status = `Unable to get app details: ${e}`;
      return status;
    }

    // list all app installations
    try {
      const installations = (await appOctokit.request('GET /app/installations')).data;
      for (const installation of installations) {
        let installationDetails = {
          id: installation.id,
          url: `https://${githubSecrets.domain}/settings/installations/${installation.id}`,
          status: 'Unable to query',
          repositories: [] as string[],
        };

        let token;
        try {
          token = (await appOctokit.auth({
            type: 'installation',
            installationId: installation.id,
          }) as any).token;
        } catch (e) {
          installationDetails.status = `Unable to authenticate app installation: ${e}`;
          continue;
        }

        let octokit;
        try {
          octokit = new Octokit({ baseUrl, auth: token });
        } catch (e) {
          installationDetails.status = `Unable to authenticate using app: ${e}`;
          continue;
        }

        try {
          const repositories = (await octokit.request('GET /installation/repositories')).data.repositories;
          for (const repo of repositories) {
            installationDetails.repositories.push(repo.full_name as string);
          }
        } catch (e) {
          installationDetails.status = `Unable to authenticate using installation token: ${e}`;
          continue;
        }

        installationDetails.status = 'OK';
        status.github.auth.app.installations.push(installationDetails);
      }
    } catch (e) {
      status.github.auth.status = 'Unable to list app installations';
      return status;
    }

    status.github.auth.status = 'OK';

    // check webhook config
    try {
      const response = await appOctokit.request('GET /app/hook/config', {});

      if (response.data.url !== process.env.WEBHOOK_URL) {
        status.github.webhook.status = 'GitHub has wrong webhook URL configured';
      } else {
        // TODO check secret by doing a dummy delivery? force apply secret?
        status.github.webhook.status = 'OK (note that secret cannot be checked automatically)';
      }
    } catch (e) {
      status.github.webhook.status = `Unable to check app configuration: ${e}`;
      return status;
    }
  }

  return status;
};
