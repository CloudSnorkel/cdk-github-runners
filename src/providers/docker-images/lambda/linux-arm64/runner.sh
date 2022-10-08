#!/bin/bash

set -e -u -o pipefail

cp -r /runner /tmp/
cd /tmp/runner

./config.sh --unattended --url "https://${GITHUB_DOMAIN}/${OWNER}/${REPO}" --token "${RUNNER_TOKEN}" --ephemeral --work _work --labels "${RUNNER_LABEL}" --name "${RUNNER_NAME}" --disableupdate
echo Config done
./run.sh
echo Run done
