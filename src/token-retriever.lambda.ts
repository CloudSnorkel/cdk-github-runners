import { RequestError } from '@octokit/request-error';
import { getOctokit } from './lambda-github';
import { StepFunctionLambdaInput } from './lambda-helpers';

class RunnerTokenError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'RunnerTokenError';
    Object.setPrototypeOf(this, RunnerTokenError.prototype);
  }
}


exports.handler = async function (event: StepFunctionLambdaInput) {
  try {
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
      token: response.data.token,
    };
  } catch (error) {
    console.error(error);
    const reqError = <RequestError>error;
    throw new RunnerTokenError(reqError.message);
  }
};
