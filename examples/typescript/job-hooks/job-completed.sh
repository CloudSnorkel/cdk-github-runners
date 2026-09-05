#!/bin/bash
#
# GitHub Actions job completed hook.
#
# The self-hosted runner executes this script after every job it runs, because
# we point the ACTIONS_RUNNER_HOOK_JOB_COMPLETED environment variable at it. Use
# it for anything that should happen once per job after it finishes -- for
# example cleaning the workspace, flushing logs, or sending a notification.
#
# GitHub passes job context to the hook as environment variables. See:
# https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/running-scripts-before-or-after-a-job

set -euo pipefail

echo "Running job completed hook for ${GITHUB_REPOSITORY:-unknown} run ${GITHUB_RUN_ID:-unknown}"

# Put your own per-job cleanup commands here.

echo "Job completed hook finished"
