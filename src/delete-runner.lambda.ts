import { RequestError } from '@octokit/request-error';
import { getOctokit } from './github';
import { StepFunctionLambdaInput } from './lambda-helpers';

interface DeleteRunnerInput extends StepFunctionLambdaInput {
  readonly idleOnly: boolean;
}

async function getRunnerId(octokit: any, owner: string, repo: string, name: string, idleOnly: boolean) {
  let page = 1;
  while (true) {
    const runners = await octokit.request('GET /repos/{owner}/{repo}/actions/runners?per_page=100&page={page}', {
      page: page,
      owner: owner,
      repo: repo,
    });

    if (runners.data.runners.length == 0) {
      return;
    }

    for (const runner of runners.data.runners) {
      if (runner.name == name) {
        if (idleOnly) {
          if (!runner.busy) {
            return runner.id;
          } else {
            console.log('Runner is busy, no need to delete.');
            return;
          }
        }
        return runner.id;
      }
    }

    page++;
  }
}

class RunnerBusy extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'RunnerBusy';
    Object.setPrototypeOf(this, RunnerBusy.prototype);
  }
}

exports.handler = async function (event: DeleteRunnerInput) {
  const { octokit } = await getOctokit(event.installationId);

  // find runner id
  const runnerId = await getRunnerId(octokit, event.owner, event.repo, event.runnerName, event.idleOnly);
  if (!runnerId) {
    console.error(`Unable to find runner id for ${event.owner}/${event.repo}:${event.runnerName}`);
    return;
  }

  console.log(`Runner ${event.runnerName} has id #${runnerId}`);

  // delete runner (it usually gets deleted by ./run.sh, but it stopped prematurely if we're here).
  // it seems like runners are automatically removed after a timeout, if they first accepted a job.
  // we try removing it anyway for cases where a job wasn't accepted, and just in case it wasn't removed.
  // repos have a limited number of self-hosted runners, so we can't leave dead ones behind.
  try {
    await octokit.rest.actions.deleteSelfHostedRunnerFromRepo({
      owner: event.owner,
      repo: event.repo,
      runner_id: runnerId,
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
