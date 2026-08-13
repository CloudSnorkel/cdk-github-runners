#!/bin/bash

set -ex

# Change directory to the folder where this script lives (Lambda copies to /tmp/runner)
cd "$(dirname "$0")"

if [ "$1" = "--stop" ]; then
  # stop the loop below in case the runner didn't write the workflow id itself for whatever reason
  # we need to stop it or it can stop our wrapper script from exiting and leave the provisioned resource behind
  echo NONE >> .workflowid
  exit 0
fi

set +x  # don't spam log with sleeps
(
  while [ ! -s .workflowid ]; do sleep 1; done
  echo CDKGHR JOB RUNNER=$1 WORKFLOW_ID=`head -n 1 .workflowid`
) &
