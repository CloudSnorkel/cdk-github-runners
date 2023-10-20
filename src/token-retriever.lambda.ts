import { RequestError } from '@octokit/request-error';
import { Octokit } from '@octokit/rest';
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
    const {
      githubSecrets,
      octokit,
    } = await getOctokit(event.installationId);
    const githubRunnerLevel = await getSecretJsonValue(process.env.GITHUB_RUNNER_LEVEL_ARN);

    let token: string;
    if (githubRunnerLevel.runnerLevel === 'repo') {
      token = await getRegistrationTokenForRepo(octokit, event.owner, event.repo);
    } else if (githubRunnerLevel.runnerLevel === 'org') {
      token = await getRegistrationTokenForOrg(octokit, event.owner);
    } else {
      throw new RunnerTokenError('Invalid runner level');
    }
    return {
      domain: githubSecrets.domain,
      runnerLevel: githubRunnerLevel.runnerLevel,
      token,
    };
  } catch (error) {
    console.error(error);
    const reqError = <RequestError>error;
    throw new RunnerTokenError(reqError.message);
  }
}
async function getRegistrationTokenForOrg(octokit: Octokit, owner: string): Promise<string> {

  const response = await octokit.rest.actions.createRegistrationTokenForOrg({
    org: owner,
  });
  return response.data.token;

}

async function getRegistrationTokenForRepo(octokit: Octokit, owner: string, repo: string): Promise<string> {
  const response = await octokit.rest.actions.createRegistrationTokenForRepo({
    owner: owner,
    repo: repo,
  });
  return response.data.token;

}
