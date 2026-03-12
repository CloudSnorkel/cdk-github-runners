import type { Octokit } from '@octokit/rest';
import { getOctokit } from './lambda-github';
import { StepFunctionLambdaInput } from './lambda-helpers';

class RunnerTokenError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'RunnerTokenError';
    Object.setPrototypeOf(this, RunnerTokenError.prototype);
  }
}


export async function handler(event: StepFunctionLambdaInput) {
  try {
    const {
      githubSecrets,
      octokit,
    } = await getOctokit(event.installationId);

    // Before creating a runner, check if the job is still queued.
    // This prevents wasting resources when a job was already picked up by
    // another runner (e.g., during retries or when runners race for jobs
    // with identical labels under burst load).
    if (event.jobId) {
      const jobStatus = await checkJobStatus(octokit, event.owner, event.repo, event.jobId);
      if (jobStatus !== 'queued') {
        console.log({
          notice: 'Job is no longer queued, skipping runner creation',
          jobId: event.jobId,
          jobStatus,
          owner: event.owner,
          repo: event.repo,
        });
        return {
          domain: githubSecrets.domain,
          skip: true,
          token: '',
          registrationUrl: '',
          jitConfig: '',
          runnerId: 0,
        };
      }
    }

    // Use JIT runner config when jobId is available.
    // JIT provides a cleaner registration path (no config.sh needed) and
    // built-in ephemeral behavior. Note: JIT does not pin runners to specific
    // jobs — GitHub still dispatches based on label matching.
    if (event.jobId) {
      const jitResult = await getJitConfig(octokit, githubSecrets.runnerLevel, event.owner, event.repo, event.runnerName, event.labels, event.jobId);
      return {
        domain: githubSecrets.domain,
        jitConfig: jitResult.encodedJitConfig,
        runnerId: jitResult.runnerId,
        skip: false,
        token: '',
        registrationUrl: '',
      };
    }

    // Fallback: legacy registration token flow
    let token: string;
    let registrationUrl: string;
    if (githubSecrets.runnerLevel === 'repo' || githubSecrets.runnerLevel === undefined) {
      token = await getRegistrationTokenForRepo(octokit, event.owner, event.repo);
      registrationUrl = `https://${githubSecrets.domain}/${event.owner}/${event.repo}`;
    } else if (githubSecrets.runnerLevel === 'org') {
      token = await getRegistrationTokenForOrg(octokit, event.owner);
      registrationUrl = `https://${githubSecrets.domain}/${event.owner}`;
    } else {
      throw new RunnerTokenError('Invalid runner level');
    }
    return {
      domain: githubSecrets.domain,
      token,
      registrationUrl,
      jitConfig: '',
      runnerId: 0,
      skip: false,
    };
  } catch (error) {
    console.error({
      notice: 'Failed to retrieve runner registration token',
      owner: event.owner,
      repo: event.repo,
      runnerName: event.runnerName,
      jobId: event.jobId,
      error: `${error}`,
    });
    throw new RunnerTokenError((<Error>error).message);
  }
}

type RunnerLevel = 'repo' | 'org' | undefined;

async function checkJobStatus(
  octokit: Octokit,
  owner: string,
  repo: string,
  jobId: number,
): Promise<string> {
  const response = await octokit.rest.actions.getJobForWorkflowRun({
    owner,
    repo,
    job_id: jobId,
  });
  return response.data.status;
}

async function getJitConfig(
  octokit: Octokit,
  runnerLevel: RunnerLevel,
  owner: string,
  repo: string,
  runnerName: string,
  labels: string[],
  jobId: number,
): Promise<{ encodedJitConfig: string; runnerId: number }> {
  const runnerGroupId = 1; // Default runner group

  const body = {
    name: runnerName,
    runner_group_id: runnerGroupId,
    labels: labels.map(l => l.trim()).filter(l => l.length > 0),
    work_folder: '_work',
  };

  let response;
  if ((runnerLevel ?? 'repo') === 'repo') {
    response = await octokit.request('POST /repos/{owner}/{repo}/actions/runners/generate-jitconfig', {
      owner,
      repo,
      ...body,
    });
  } else {
    response = await octokit.request('POST /orgs/{org}/actions/runners/generate-jitconfig', {
      org: owner,
      ...body,
    });
  }

  console.log({
    notice: 'Generated JIT runner config',
    runnerId: response.data.runner.id,
    runnerName: response.data.runner.name,
    jobId,
  });

  return {
    encodedJitConfig: response.data.encoded_jit_config,
    runnerId: response.data.runner.id,
  };
}

async function getRegistrationTokenForOrg(octokit: Octokit, owner: string): Promise<string> {
  const response = await octokit.rest.actions.createRegistrationTokenForOrg({
    org: owner,
  });
  return response.data.token;
}

async function getRegistrationTokenForRepo(octokit: Octokit, owner: string, repo: string): Promise<string> {
  const response = await octokit.rest.actions.createRegistrationTokenForRepo({
    owner: owner,
    repo: repo,
  });
  return response.data.token;
}
