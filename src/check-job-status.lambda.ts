import { getOctokit } from './lambda-github';
import { StepFunctionLambdaInput } from './lambda-helpers';

exports.handler = async function (event: StepFunctionLambdaInput) {
  const { octokit } = await getOctokit(event.installationId);

  const job = await octokit.request('GET /repos/{owner}/{repo}/actions/jobs/{jobId}', {
    owner: event.owner,
    repo: event.repo,
    jobId: event.jobId,
  });

  if (job.status === 'queued') {
    return;
  }

  throw new Error('Job not in queued status');
};
