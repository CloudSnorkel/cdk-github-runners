#!/bin/bash

set -e -u -o pipefail

cp -r /runner /tmp/
cd /tmp/runner

export PATH=/var/lang/bin:/usr/local/bin:/usr/bin/:/bin:/opt/bin
./config.sh --unattended --url "https://${GITHUB_DOMAIN}/${OWNER}/${REPO}" --token "${RUNNER_TOKEN}" --ephemeral --work _work --labels "${RUNNER_LABEL}" --name "${RUNNER_NAME}" --disableupdate
echo Config done
./run.sh
echo Run done
