import { RequestError } from '@octokit/request-error';
import { getOctokit } from './lambda-github';
import { StepFunctionLambdaInput, getSecretJsonValue } from './lambda-helpers';

class RunnerTokenError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'RunnerTokenError';
    Object.setPrototypeOf(this, RunnerTokenError.prototype);
  }
}


export async function handler(event: StepFunctionLambdaInput) {
  try {
    const githubRunnerLevel = await getSecretJsonValue(process.env.GITHUB_RUNNER_LEVEL_ARN);

    if (githubRunnerLevel.runnerLevel === 'repo') {
      return await getRegistrationTokenForRepo(event, githubRunnerLevel);
    } else if (githubRunnerLevel.runnerLevel === 'org') {
      return await getRegistrationTokenForOrg(event, githubRunnerLevel);
    } else {
      throw new RunnerTokenError('Invalid runner level');
    }
  } catch (error) {
    console.error(error);
    const reqError = <RequestError>error;
    throw new RunnerTokenError(reqError.message);
  }
}
async function getRegistrationTokenForOrg(event: StepFunctionLambdaInput, githubRunnerLevel: any) {
  const {
    githubSecrets,
    octokit,
  } = await getOctokit(event.installationId);
  const response = await octokit.rest.actions.createRegistrationTokenForOrg({
    org: event.owner,
  });
  return {
    domain: githubSecrets.domain,
    runnerLevel: githubRunnerLevel.runnerLevel,
    token: response.data.token,
  };
}

async function getRegistrationTokenForRepo(event: StepFunctionLambdaInput, githubRunnerLevel: any) {
  const {
    githubSecrets,
    octokit,
  } = await getOctokit(event.installationId);
  const response = await octokit.rest.actions.createRegistrationTokenForRepo({
    owner: event.owner,
    repo: event.repo,
  });
  return {
    domain: githubSecrets.domain,
    runnerLevel: githubRunnerLevel.runnerLevel,
    token: response.data.token,
  };
}
