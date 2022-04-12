import { getOctokit } from '../github';

exports.handler = async function (event: any) {
  const { githubSecrets, octokit } = await getOctokit();

  const response = await octokit.request('POST /repos/{owner}/{repo}/actions/runners/registration-token', {
    owner: event.owner,
    repo: event.repo,
  });

  return {
    domain: githubSecrets.domain,
    token: response.data.token,
  };
};
