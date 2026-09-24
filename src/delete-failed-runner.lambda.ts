import type { RequestError } from '@octokit/request-error' with { 'resolution-mode': 'import' };
import { terminateRunnerInstances } from './lambda-ec2';
import { deleteRunner, getOctokit, getRunner } from './lambda-github';
import { StepFunctionLambdaInput } from './lambda-helpers';

/**
 * Runner families that can leave an EC2 instance behind. Everything else is managed by AWS for us, so there is
 * nothing to look for and no reason to spend an `ec2:DescribeInstances` call on a quota shared with every runner in
 * the account.
 */
const EC2_FAMILIES = ['ec2'];

interface DeleteFailedRunnerInput extends StepFunctionLambdaInput {
  /**
   * Family of the provider config that was tried, straight out of `$.providerParams.family`. A fallback chain hits
   * this Lambda once per attempt, so this is the family of that attempt and not of the whole chain.
   *
   * Undefined for executions started before this field existed.
   */
  readonly family?: string;
}

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

  /**
   * Instances we terminated because they outlived the runner. Usually empty: an EC2 runner should power itself off so any instance listed here failed
   * to do that for some reason. Other providers are not affected because AWS handles turning them off for us.
   */
  readonly instancesTerminated: string[];
}

/**
 * Terminate leftover instances, but only for families that can have them.
 */
async function terminateInstancesIfNeeded(event: DeleteFailedRunnerInput): Promise<string[]> {
  if (!EC2_FAMILIES.includes(event.family ?? '')) {
    return [];
  }

  return terminateRunnerInstances(event.runnerName);
}

export async function handler(event: DeleteFailedRunnerInput): Promise<DeleteFailedRunnerResult> {
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
    return {
      runnerFound: false,
      runnerDeleted: false,
      // terminate any instances that didn't properly power-off due to some extreme failure
      instancesTerminated: await terminateInstancesIfNeeded(event),
    };
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
      //
      // we deliberately don't terminate the instance here. the task token is dead, but GitHub says a job is still
      // running on this runner, and that job's instance is the one we would be killing. the step function retries
      // this state for an hour, which is long enough for the job to finish and the runner to remove itself
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
      // we can't be sure the runner is not busy. if the RunnerBusy loop get exhausted and the step function errors out, the idle reaper will hard
      // delete the instance once the runner finally times-out.
      return { runnerFound: true, runnerDeleted: false, instancesTerminated: [] };
    }
  }

  // don't terminate here to let the runner logs flush to CloudWatch. the runner should power itself off, but if it doesn't we will terminate it later
  // in the idle reaper.
  return { runnerFound: true, runnerDeleted: true, instancesTerminated: [] };
}
