# Job Hooks Example

This example demonstrates how to run a script before every job using [GitHub Actions runner hooks](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/running-scripts-before-or-after-a-job).

## What This Example Shows

- How to run a script **before every job** and **after every job**
- How to bake hook scripts into the runner image as versioned assets (instead of echoing them into files at deploy time)
- How to wire the scripts up with the `ACTIONS_RUNNER_HOOK_JOB_STARTED` and `ACTIONS_RUNNER_HOOK_JOB_COMPLETED` environment variables

## Why Runner Hooks?

GitHub's self-hosted runner can run a script before or after every job. Point `ACTIONS_RUNNER_HOOK_JOB_STARTED` (or `ACTIONS_RUNNER_HOOK_JOB_COMPLETED`) at a script and the runner executes it around each job. GitHub passes job context to the hook as environment variables like `$GITHUB_REPOSITORY` and `$GITHUB_RUN_ID`.

This is useful for anything that needs to happen once per job, for example logging job metadata, sending a notification, preparing or cleaning the workspace, or gating jobs. It's a supported, portable mechanism that works across all providers (EC2, ECS, Fargate, CodeBuild, Lambda).

> **Note:** Runner hooks run per job. If instead you want software installed or a service running on the runner itself, add it to the image (see the [Add Software](../add-software/) example) or configure a systemd unit as part of the image build.

## How It Works

1. The hook scripts live in [`job-started.sh`](job-started.sh) and [`job-completed.sh`](job-completed.sh) -- real, lintable, version-controlled files.
2. `RunnerImageComponent.jobStartedHook(...)` and `RunnerImageComponent.jobCompletedHook(...)` each take a path to a local script. They copy it into the image, mark it executable, and set the matching `ACTIONS_RUNNER_HOOK_JOB_STARTED` / `ACTIONS_RUNNER_HOOK_JOB_COMPLETED` environment variable for you.

If you only need one of the hooks, add just that component.

## Setup

1. Edit [`job-started.sh`](job-started.sh) and [`job-completed.sh`](job-completed.sh) to run your own per-job commands
2. Deploy the stack: `cdk deploy`
3. Follow the setup instructions in the main [README.md](../../../README.md) to configure GitHub integration
4. Use the `ec2` label in your workflows -- the hook runs automatically before each job
