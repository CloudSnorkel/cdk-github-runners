import { DescribeExecutionCommand, ListExecutionsCommand, SFNClient } from '@aws-sdk/client-sfn';
import * as AWSLambda from 'aws-lambda';
import { baseUrlFromDomain, GitHubSecrets, loadOctokitAuthApp, loadOctokitCore } from './lambda-github';
import { getSecretJsonValue, getSecretValue } from './lambda-helpers';
import { generateProvidersStatus, lambdaArnToLogGroup, lambdaArnToUrl, secretArnToUrl, stepFunctionArnToUrl } from './troubleshoot-helpers';

const sf = new SFNClient();

interface AppInstallation {
  readonly id: number;
  readonly url: string;
  readonly status: string;
  readonly repositories: string[];
}

interface RecentRun {
  readonly owner?: string;
  readonly repo?: string;
  readonly jobId?: string;
  readonly executionArn?: string;
  readonly status: string;
}

function safeReturnValue(event: Partial<AWSLambda.APIGatewayProxyEvent>, status: any) {
  if (event.path) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(status),
    };
  }

  return status;
}

export async function handler(event: Partial<AWSLambda.APIGatewayProxyEvent>) {
  // confirm required environment variables
  if (!process.env.WEBHOOK_SECRET_ARN || !process.env.GITHUB_SECRET_ARN || !process.env.GITHUB_PRIVATE_KEY_SECRET_ARN || !process.env.LOGICAL_ID ||
      !process.env.WEBHOOK_HANDLER_ARN || !process.env.STEP_FUNCTION_ARN || !process.env.SETUP_SECRET_ARN ||
      !process.env.STACK_NAME) {
    throw new Error('Missing environment variables');
  }

  const [core, authApp] = await Promise.all([
    loadOctokitCore(),
    loadOctokitAuthApp(),
  ]);
  const { Octokit } = core;
  const { createAppAuth } = authApp;

  // base status
  const status = {
    github: {
      setup: {
        status: 'Unknown',
        url: '',
        secretArn: process.env.SETUP_SECRET_ARN,
        secretUrl: secretArnToUrl(process.env.SETUP_SECRET_ARN),
      },
      domain: 'Unknown',
      runnerLevel: 'Unknown',
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
          id: -1,
          url: '',
          installations: [] as AppInstallation[],
        },
        personalAuthToken: '',
      },
    },
    providers: await generateProvidersStatus(process.env.STACK_NAME, process.env.LOGICAL_ID),
    troubleshooting: {
      webhookHandlerArn: process.env.WEBHOOK_HANDLER_ARN,
      webhookHandlerUrl: lambdaArnToUrl(process.env.WEBHOOK_HANDLER_ARN),
      webhookHandlerLogGroup: lambdaArnToLogGroup(process.env.WEBHOOK_HANDLER_ARN),
      stepFunctionArn: process.env.STEP_FUNCTION_ARN,
      stepFunctionUrl: stepFunctionArnToUrl(process.env.STEP_FUNCTION_ARN),
      stepFunctionLogGroup: process.env.STEP_FUNCTION_LOG_GROUP,
      recentRuns: [] as RecentRun[],
    },
  };

  // setup url
  if (process.env.SETUP_FUNCTION_URL) {
    const setupToken = (await getSecretJsonValue(process.env.SETUP_SECRET_ARN)).token;
    if (setupToken) {
      status.github.setup.status = 'Pending';
      status.github.setup.url = `${process.env.SETUP_FUNCTION_URL}?token=${setupToken}`;
    } else {
      status.github.setup.status = 'Complete';
    }
  } else {
    status.github.setup.status = 'Disabled';
  }

  // list last 10 executions and their status
  try {
    const executions = await sf.send(new ListExecutionsCommand({
      stateMachineArn: process.env.STEP_FUNCTION_ARN,
      maxResults: 10,
    }));
    for (const execution of executions.executions ?? []) {
      const executionDetails = await sf.send(new DescribeExecutionCommand({
        executionArn: execution.executionArn,
      }));
      const input = JSON.parse(executionDetails.input || '{}');

      status.troubleshooting.recentRuns.push({
        executionArn: execution.executionArn,
        status: execution.status ?? '<unknown>',
        owner: input.owner,
        repo: input.repo,
        jobId: input.jobId,
      });
    }
  } catch (e) {
    status.troubleshooting.recentRuns.push({ status: `Error getting executions: ${e}` });
  }

  // get secrets
  let githubSecrets: GitHubSecrets;
  try {
    githubSecrets = await getSecretJsonValue(process.env.GITHUB_SECRET_ARN);
  } catch (e) {
    status.github.auth.status = `Unable to read secret: ${e}`;
    return safeReturnValue(event, status);
  }

  let privateKey;
  try {
    privateKey = await getSecretValue(process.env.GITHUB_PRIVATE_KEY_SECRET_ARN);
  } catch (e) {
    status.github.auth.status = `Unable to read private key secret: ${e}`;
    return safeReturnValue(event, status);
  }

  // calculate base url
  let baseUrl = baseUrlFromDomain(githubSecrets.domain);
  status.github.domain = githubSecrets.domain;

  // copy runner level
  status.github.runnerLevel = githubSecrets.runnerLevel ?? 'repo';

  if (githubSecrets.personalAuthToken) {
    // try authenticating with personal access token
    status.github.auth.type = 'Personal Access Token';
    status.github.auth.personalAuthToken = '*redacted*';

    let octokit;
    try {
      octokit = new Octokit({ baseUrl, auth: githubSecrets.personalAuthToken });
    } catch (e) {
      status.github.auth.status = `Unable to authenticate using personal auth token: ${e}`;
      return safeReturnValue(event, status);
    }

    try {
      const user = await octokit.request('GET /user');
      status.github.auth.personalAuthToken = `username: ${user.data.login}`;
    } catch (e) {
      status.github.auth.status = `Unable to call /user with personal auth token: ${e}`;
      return safeReturnValue(event, status);
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
      return safeReturnValue(event, status);
    }

    // get app url
    try {
      const appRes = await appOctokit.request('GET /app');
      const app = appRes.data;
      if (!app) {
        status.github.auth.status = `Unable to get app: ${appRes}`;
        return safeReturnValue(event, status);
      }
      status.github.auth.app.url = app.html_url;
    } catch (e) {
      status.github.auth.status = `Unable to get app details: ${e}`;
      return safeReturnValue(event, status);
    }

    // list all app installations
    try {
      const installations = (await appOctokit.request('GET /app/installations')).data;
      for (const installation of installations) {
        let installationDetails = {
          id: installation.id,
          url: installation.html_url,
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
      return safeReturnValue(event, status);
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
      return safeReturnValue(event, status);
    }
  }

  return safeReturnValue(event, status);
}
