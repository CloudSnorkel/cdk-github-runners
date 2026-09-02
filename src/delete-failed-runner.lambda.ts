import type { RequestError } from '@octokit/request-error' with { 'resolution-mode': 'import' };
import { deleteRunner, getOctokit, getRunner } from './lambda-github';
import { StepFunctionLambdaInput } from './lambda-helpers';

class RunnerBusy extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'RunnerBusy';
    Object.setPrototypeOf(this, RunnerBusy.prototype);
  }
}

/**
 * Outcome of the clean-up, stored in `$.delete` by the step function so the execution history says what happened.
 *
 * We don't fail the execution ourselves. The original error that got us here is re-raised by a separate `Rethrow Error`
 * state, so a red `Delete Failed Runner` state always means the clean-up itself had a problem.
 */
interface DeleteFailedRunnerResult {
  /**
   * Was a runner still registered on GitHub Actions when we looked for it?
   */
  readonly runnerFound: boolean;

  /**
   * Did we delete the runner? Always false when no runner was found, as there is nothing to delete.
   */
  readonly runnerDeleted: boolean;
}

export async function handler(event: StepFunctionLambdaInput): Promise<DeleteFailedRunnerResult> {
  const { octokit, githubSecrets } = await getOctokit(event.installationId);

  // find runner id
  const runner = await getRunner(octokit, githubSecrets.runnerLevel, event.owner, event.repo, event.runnerName);
  if (!runner) {
    console.warn({
      notice: 'Unable to find runner id (usually fine, as the runner may have never registered or already removed itself)',
      owner: event.owner,
      repo: event.repo,
      runnerName: event.runnerName,
    });
    return { runnerFound: false, runnerDeleted: false };
  }

  console.log({
    notice: 'Found runner id',
    runnerName: event.runnerName,
    runnerId: runner.id,
    owner: event.owner,
    repo: event.repo,
  });

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
      console.error({
        notice: 'Unable to delete runner',
        owner: event.owner,
        repo: event.repo,
        runnerId: runner.id,
        runnerName: event.runnerName,
        error: e,
      });
      return { runnerFound: true, runnerDeleted: false };
    }
  }

  return { runnerFound: true, runnerDeleted: true };
}
