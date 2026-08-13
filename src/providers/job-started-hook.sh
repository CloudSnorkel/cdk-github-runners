#!/bin/sh

set -e

# lambda copies everything to /tmp/runner
if [ -d /tmp/runner ]; then
  cd /tmp/runner
else
  cd $(dirname "$0")
fi

# notify the runner wrapper that a job started, so it can detect stolen runners
echo $GITHUB_RUN_ID >> .workflowid || true

# run user hook if it exists
if [ -x job-started-hook-user.sh ]; then
  exec ./job-started-hook-user.sh
fi
