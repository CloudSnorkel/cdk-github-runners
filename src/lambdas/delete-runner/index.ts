import { getOctokit } from '../github';

async function getRunnerId(octokit: any, owner: string, repo: string, name: string) {
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
        return runner.id;
      }
    }

    page++;
  }
}

exports.handler = async function (event: any) {
  const { octokit } = await getOctokit();

  // cancel job so it doesn't get assigned to other runners by mistake or just sit there waiting
  await octokit.request('POST /repos/{owner}/{repo}/actions/runs/{runId}/cancel', {
    owner: event.owner,
    repo: event.repo,
    runId: event.runId,
  });

  // find runner id
  const runnerId = await getRunnerId(octokit, event.owner, event.repo, event.runnerName.slice(0, 63));
  if (!runnerId) {
    console.error(`Unable to find runner id for ${event.owner}/${event.repo}:${event.runnerName.slice(0, 63)}`);
    return;
  }

  console.log(`Runner ${event.runnerName.slice(0, 63)} has id #${runnerId}`);

  // delete runner (it usually gets deleted by ./run.sh, but it stopped prematurely if we're here)
  await octokit.request('DELETE /repos/{owner}/{repo}/actions/runners/{runnerId}', {
    owner: event.owner,
    repo: event.repo,
    runnerId,
  });
};
