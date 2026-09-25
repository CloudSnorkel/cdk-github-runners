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

/**
 * Outcome of the clean-up, stored in `$.delete` by the step function so the execution history says what happened.
 *
 * The original error that got us here is re-raised by a separate `Rethrow Error` state, so a red `Delete Failed Runner`
 * state always means the clean-up itself had a problem. We only throw when we can't be sure the runner is gone.
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

  // the runner is already gone, so this can't block the next attempt. we don't throw as the step function would retry
  // and eventually give up on the whole execution. the idle reaper will try again once this execution is done.
  try {
    return await terminateRunnerInstances(event.runnerName);
  } catch (e) {
    console.error({
      notice: 'Unable to terminate leftover instances',
      runnerName: event.runnerName,
      error: e,
    });
    return [];
  }
}

export async function handler(event: DeleteFailedRunnerInput): Promise<DeleteFailedRunnerResult> {
  // any error before we know the runner is gone is thrown as-is. the step function retries all of them for an hour and
  // then fails the whole execution without retrying it. see `Runner Not Deleted` in runner.ts for why.
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
  //
  // any error here means the runner is still registered, usually because it's still running a job. we don't try to
  // parse the error as GitHub changed the busy message before (#1007) and older GHES versions may still use the old one.
  // deleting a runner that's already gone returns 204, so trying to delete a missing runner doesn't throw and just succeeds.
  try {
    await deleteRunner(octokit, githubSecrets.runnerLevel, event.owner, event.repo, runner.id);
  } catch (e) {
    console.error({
      notice: 'Unable to delete runner',
      owner: event.owner,
      repo: event.repo,
      runnerId: runner.id,
      runnerName: event.runnerName,
      error: e,
    });
    // ideally we would stop the job that's hanging on this failed runner, but GitHub Actions only has API to stop the entire workflow
    //
    // we deliberately don't terminate the instance here. the task token is dead, but GitHub says a job might still be running on this runner, and
    // that job's instance is the one we would be killing. the step function retries this state for an hour, which is long enough for the job to
    // finish and the runner to remove itself. if it's still there after that, the idle reaper keeps watching it and will hard delete the instance
    // once it's done.
    throw e;
  }

  // don't terminate here to let the runner logs flush to CloudWatch. the runner should power itself off, but if it doesn't we will terminate it later
  // in the idle reaper.
  return { runnerFound: true, runnerDeleted: true, instancesTerminated: [] };
}
