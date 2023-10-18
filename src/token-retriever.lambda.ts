import { RequestError } from '@octokit/request-error';
import { GitHubSecrets, getOctokit } from './lambda-github';
import { StepFunctionLambdaInput } from './lambda-helpers';

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

    if ((githubSecrets as GitHubSecrets).runnerLevel === 'repo') {
      const response = await octokit.rest.actions.createRegistrationTokenForRepo({
        owner: event.owner,
        repo: event.repo,
      });
      return {
        domain: githubSecrets.domain,
        runnerLevel: githubSecrets.runnerLevel,
        token: response.data.token,
      };
    } else if ((githubSecrets as GitHubSecrets).runnerLevel === 'org') {
      const response = await octokit.rest.actions.createRegistrationTokenForOrg({
        org: event.owner,
      });
      return {
        domain: githubSecrets.domain,
        runnerLevel: githubSecrets.runnerLevel,
        token: response.data.token,
      };
    } else {
      throw new RunnerTokenError('Invalid runner level');
    }
  } catch (error) {
    console.error(error);
    const reqError = <RequestError>error;
    throw new RunnerTokenError(reqError.message);
  }
}
