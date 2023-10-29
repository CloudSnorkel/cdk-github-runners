import { Octokit } from '@octokit/rest';
import { getOctokit } from './lambda-github';
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

    let token: string;
    let registrationUrl: string;
    if (githubSecrets.runnerLevel === 'repo' || githubSecrets.runnerLevel === undefined) {
      token = await getRegistrationTokenForRepo(octokit, event.owner, event.repo);
      registrationUrl = `https://${githubSecrets.domain}/${event.owner}/${event.repo}`;
    } else if (githubSecrets.runnerLevel === 'org') {
      token = await getRegistrationTokenForOrg(octokit, event.owner);
      registrationUrl = `https://${githubSecrets.domain}/${event.owner}`;
    } else {
      throw new RunnerTokenError('Invalid runner level');
    }
    return {
      domain: githubSecrets.domain,
      token,
      registrationUrl,
    };
  } catch (error) {
    console.error(error);
    throw new RunnerTokenError((<Error>error).message);
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
