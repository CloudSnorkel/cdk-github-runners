#!/bin/bash

set -euo pipefail

while true
do
  # get data from lambda
  HEADERS="$(mktemp)"
  EVENT_DATA=$(curl -sS -LD "$HEADERS" "http://${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/next")
  REQUEST_ID=$(grep -Fi Lambda-Runtime-Aws-Request-Id "$HEADERS" | tr -d '[:space:]' | cut -d: -f2)

  # execute runner and respond
  if bash /runner.sh "$EVENT_DATA"; then
    curl "http://${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/$REQUEST_ID/response" -d ""
  else
    curl "http://${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/$REQUEST_ID/error" -d "{\"errorMessage\": \"Runner failed with exit code $?\", \"errorType\": \"Error\", \"stackTrace\": []}"
  fi

  # cleanup
  find /tmp -mindepth 1 -maxdepth 1 -exec rm -rf '{}' \;
done
