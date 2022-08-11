import { getOctokit } from '../github';
import { StepFunctionLambdaInput } from '../helpers';

exports.handler = async function (event: StepFunctionLambdaInput) {
  const { githubSecrets, octokit } = await getOctokit(event.installationId);

  const response = await octokit.request('POST /repos/{owner}/{repo}/actions/runners/registration-token', {
    owner: event.owner,
    repo: event.repo,
  });

  return {
    domain: githubSecrets.domain,
    token: response.data.token,
  };
};
