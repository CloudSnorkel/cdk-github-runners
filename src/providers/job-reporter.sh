#!/bin/bash

set -e

# Change directory to the folder where this script lives (Lambda copies to /tmp/runner)
cd "$(dirname "$0")"

RUNNER=$1
LOG=$2

(
  # . -ef "$PWD" is a hack to detect if the current directory has been deleted by Lambda cleanup
  # if the directory is deleted, the script will exit to avoid contaminating future executions
  while [ ! -s .workflowid ] && [ . -ef "$PWD" ]; do sleep 1; done
  if [ -s .workflowid ]; then
    WORKFLOW=`head -n 1 .workflowid`
    echo CDKGHR JOB RUNNER=$RUNNER $WORKFLOW
  fi
) >> "${LOG:-/dev/stdout}" 2>&1 &
