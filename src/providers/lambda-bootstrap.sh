#!/bin/bash

set -euo pipefail

while true
do
  # get data from lambda
  HEADERS="$(mktemp)"
  EVENT_DATA=$(curl -sS -LD "$HEADERS" "http://${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/next")
  REQUEST_ID=$(grep -Fi Lambda-Runtime-Aws-Request-Id "$HEADERS" | tr -d '[:space:]' | cut -d: -f2)

  # cleanup from possible previous runs
  find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf '{}' \;

  # lambda's filesystem is read-only except for /tmp, so the runner gets a copy it can actually write to
  cp -r /home/runner /tmp/
  mkdir /tmp/home
  cd /tmp/runner
  export HOME=/tmp/home

  # workaround for "Cannot get required symbol EVP_rc2_cbc from libssl"
  # lambda docker image for node.js comes with stripped down libssl.so pushed in LD_LIBRARY_PATH
  if [ -f /var/lang/lib/libssl.so ]; then
    export LD_LIBRARY_PATH=/usr/lib64:$LD_LIBRARY_PATH
  fi

  # execute runner and respond
  if bash /runner.sh "$EVENT_DATA"; then
    curl "http://${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/$REQUEST_ID/response" -d ""
  else
    curl "http://${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/$REQUEST_ID/error" -d "{\"errorMessage\": \"Runner failed with exit code $?\", \"errorType\": \"Error\", \"stackTrace\": []}"
  fi
done
