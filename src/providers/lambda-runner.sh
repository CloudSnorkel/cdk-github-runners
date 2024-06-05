#!/bin/bash

set -euo pipefail

# workaround for "Cannot get required symbol EVP_rc2_cbc from libssl"
# lambda docker image for node.js comes with stripped down libssl.so pushed in LD_LIBRARY_PATH
if [ -f /var/lang/lib/libssl.so ]; then
  export LD_LIBRARY_PATH=/usr/lib64:$LD_LIBRARY_PATH
fi

# extract parameters
OWNER=$(echo "$1" | jq -r .owner)
REPO=$(echo "$1" | jq -r .repo)
GITHUB_DOMAIN=$(echo "$1" | jq -r .githubDomain)
RUNNER_TOKEN=$(echo "$1" | jq -r .token)
RUNNER_NAME=$(echo "$1" | jq -r .runnerName)
RUNNER_LABEL=$(echo "$1" | jq -r .label)
REGISTRATION_URL=$(echo "$1" | jq -r .registrationUrl)

# copy runner code (it needs a writable directory)
cp -r /home/runner /tmp/
cd /tmp/runner

# setup home directory
mkdir /tmp/home
export HOME=/tmp/home

# start runner
if [ "${RUNNER_VERSION}" = "latest" ]; then RUNNER_FLAGS=""; else RUNNER_FLAGS="--disableupdate"; fi
./config.sh --unattended --url "${REGISTRATION_URL}" --token "${RUNNER_TOKEN}" --ephemeral --work _work --labels "${RUNNER_LABEL},cdkghr:started:`date +%s`" --name "${RUNNER_NAME}" ${RUNNER_FLAGS}
echo Config done
./run.sh
echo Run done

# print status for metrics
STATUS=$(grep -Phors "finish job request for job [0-9a-f\-]+ with result: \K.*" _diag/ | tail -n1)
[ -n "$STATUS" ] && echo CDKGHA JOB DONE "$RUNNER_LABEL" "$STATUS"
