import { RequestError } from '@octokit/request-error';
import { deleteRunner, getOctokit, getRunner } from './lambda-github';
import { StepFunctionLambdaInput } from './lambda-helpers';

class RunnerBusy extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'RunnerBusy';
    Object.setPrototypeOf(this, RunnerBusy.prototype);
  }
}

class ReraisedError extends Error {
  constructor(event: StepFunctionLambdaInput) {
    super(event.error!.Cause);
    this.name = event.error!.Error;
    this.message = event.error!.Cause;
    Object.setPrototypeOf(this, ReraisedError.prototype);
  }
}

export async function handler(event: StepFunctionLambdaInput) {
  const { octokit, githubSecrets } = await getOctokit(event.installationId);

  // find runner id
  const runner = await getRunner(octokit, githubSecrets.runnerLevel, event.owner, event.repo, event.runnerName);
  if (!runner) {
    console.error(`Unable to find runner id for ${event.owner}/${event.repo}:${event.runnerName}`);
    throw new ReraisedError(event);
  }

  console.log(`Runner ${event.runnerName} has id #${runner.id}`);

  // delete runner (it usually gets deleted by ./run.sh, but it stopped prematurely if we're here).
  // it seems like runners are automatically removed after a timeout, if they first accepted a job.
  // we try removing it anyway for cases where a job wasn't accepted, and just in case it wasn't removed.
  // repos have a limited number of self-hosted runners, so we can't leave dead ones behind.
  try {
    await deleteRunner(octokit, githubSecrets.runnerLevel, event.owner, event.repo, runner.id);
  } catch (e) {
    const reqError = <RequestError>e;
    if (reqError.message.includes('is still running a job')) {
      // ideally we would stop the job that's hanging on this failed runner, but GitHub Actions only has API to stop the entire workflow
      throw new RunnerBusy(reqError.message);
    } else {
      console.error('Unable to delete runner', e);
    }
  }

  throw new ReraisedError(event);
}
