#!/bin/bash

set -euo pipefail

# workaround for "Cannot get required symbol EVP_rc2_cbc from libssl"
# lambda docker image for node.js comes with stripped down libssl.so pushed in LD_LIBRARY_PATH
if [ -f /var/lang/lib/libssl.so ]; then
  export LD_LIBRARY_PATH=/usr/lib64:$LD_LIBRARY_PATH
fi

# extract parameters
RUNNER_JIT_CONFIG=$(echo "$1" | jq -r .jitConfig)
RUNNER_NAME=$(echo "$1" | jq -r .runnerName)
RUNNER_LABEL=$(echo "$1" | jq -r .label)
OWNER=$(echo "$1" | jq -r .owner)
REPO=$(echo "$1" | jq -r .repo)
GITHUB_DOMAIN=$(echo "$1" | jq -r .githubDomain)

# copy runner code (it needs a writable directory)
cp -r /home/runner /tmp/
cd /tmp/runner

# setup home directory
mkdir /tmp/home
export HOME=/tmp/home

# check for stolen runners
./job-reporter.sh "${RUNNER_NAME}"

# start runner
./run.sh --jitconfig "${RUNNER_JIT_CONFIG}"
echo Run done

# print status for metrics
STATUS=$(grep -Phors "finish job request for job [0-9a-f\-]+ with result: \K.*" _diag/ | tail -n1)
if [ -n "$STATUS" ]; then
  echo CDKGHA JOB DONE "$RUNNER_LABEL" "$STATUS"
fi
