#!/bin/bash
#
# GitHub Actions job started hook.
#
# The self-hosted runner executes this script before every job it runs, because
# we point the ACTIONS_RUNNER_HOOK_JOB_STARTED environment variable at it. Use
# it for anything that should happen once per job -- for example logging job
# metadata, sending a notification, or preparing the workspace.
#
# GitHub passes job context to the hook as environment variables. See:
# https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/running-scripts-before-or-after-a-job

set -euo pipefail

echo "Running job started hook for ${GITHUB_REPOSITORY:-unknown} run ${GITHUB_RUN_ID:-unknown}"

# Put your own per-job commands here.

echo "Job started hook finished"
