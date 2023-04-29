import { RequestError } from '@octokit/request-error';
import { getOctokit, getRunner } from './lambda-github';
import { StepFunctionLambdaInput } from './lambda-helpers';

class RunnerBusy extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'RunnerBusy';
    Object.setPrototypeOf(this, RunnerBusy.prototype);
  }
}

exports.handler = async function (event: StepFunctionLambdaInput) {
  const { octokit } = await getOctokit(event.installationId);

  // find runner id
  const runner = await getRunner(octokit, event.owner, event.repo, event.runnerName);
  if (!runner) {
    console.error(`Unable to find runner id for ${event.owner}/${event.repo}:${event.runnerName}`);
    return;
  }

  console.log(`Runner ${event.runnerName} has id #${runner.id}`);

  // delete runner (it usually gets deleted by ./run.sh, but it stopped prematurely if we're here).
  // it seems like runners are automatically removed after a timeout, if they first accepted a job.
  // we try removing it anyway for cases where a job wasn't accepted, and just in case it wasn't removed.
  // repos have a limited number of self-hosted runners, so we can't leave dead ones behind.
  try {
    await octokit.rest.actions.deleteSelfHostedRunnerFromRepo({
      owner: event.owner,
      repo: event.repo,
      runner_id: runner.id,
    });
  } catch (e) {
    const reqError = <RequestError>e;
    if (reqError.message.includes('is still running a job')) {
      throw new RunnerBusy(reqError.message);
    } else {
      throw e;
    }
  }
};
