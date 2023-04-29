#!/bin/bash

set -e -u -o pipefail

# cleanup
find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf '{}' \;
# copy runner code (it needs a writable directory)
cp -r /home/runner /tmp/
cd /tmp/runner
# setup home directory
mkdir /tmp/home
export HOME=/tmp/home

# start runner
if [ "${RUNNER_VERSION}" = "latest" ]; then RUNNER_FLAGS=""; else RUNNER_FLAGS="--disableupdate"; fi
./config.sh --unattended --url "https://${GITHUB_DOMAIN}/${OWNER}/${REPO}" --token "${RUNNER_TOKEN}" --ephemeral --work _work --labels "${RUNNER_LABEL},cdkghr:started:`date +%s`" --name "${RUNNER_NAME}" ${RUNNER_FLAGS}
echo Config done
./run.sh
echo Run done

# print status for metrics
STATUS=$(grep -Phors "finish job request for job [0-9a-f\-]+ with result: \K.*" _diag/ | tail -n1)
[ -n "$STATUS" ] && echo CDKGHA JOB DONE "$RUNNER_LABEL" "$STATUS"
