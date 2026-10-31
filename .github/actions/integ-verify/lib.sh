# shellcheck shell=bash
# Helpers for the integration test workflows. Expects the environment set up by the integ-verify action.

# execution of a runner (runners are named after their step function execution)
execution_arn() {
  echo "${STATE_MACHINE_ARN/:stateMachine:/:execution:}:$1"
}

# wait for an execution to end, giving up after $2 minutes
wait_for_execution() {
  local deadline=$((SECONDS + $2 * 60))
  local status
  while true; do
    # not in the loop condition, so a failed call fails the step instead of ending the wait
    status=$(aws stepfunctions describe-execution --execution-arn "$1" --query status --output text)
    if [ "$status" != RUNNING ]; then
      return
    fi
    if [ $SECONDS -ge $deadline ]; then
      echo "::error::$1 is still running after $2 minutes"
      return 1
    fi
    sleep 30
  done
}

# the idle reaper stops executions with this error, so they're aborted and not failed
assert_aborted_by_reaper() {
  local result
  result=$(aws stepfunctions describe-execution --execution-arn "$1" --query '[status, error]' --output text)
  if [ "$result" != "$(printf 'ABORTED\tIdleRunner')" ]; then
    echo "::error::Expected $1 to be aborted by the idle reaper, but got: $result"
    return 1
  fi
}

# how many times an execution entered a state
times_entered() {
  aws stepfunctions get-execution-history --execution-arn "$1" --query "length(events[?stateEnteredEventDetails.name == '$2'])"
}

# output of the first time an execution left a state
first_output() {
  aws stepfunctions get-execution-history --execution-arn "$1" --query "events[?stateExitedEventDetails.name == '$2'] | [0].stateExitedEventDetails.output" --output text
}

# runner is not registered on GitHub, waiting up to $2 minutes for it to go away
assert_runner_gone() {
  local payload
  payload=$(aws stepfunctions describe-execution --execution-arn "$(execution_arn "$1")" --query input --output text |
    jq -c --arg name "$1" '{owner, repo, installationId, runnerName: $name}')
  local deadline=$((SECONDS + $2 * 60))
  while true; do
    aws lambda invoke --function-name "$RUNNER_CHECK_FUNCTION" --cli-binary-format raw-in-base64-out --payload "$payload" "$RUNNER_TEMP/registered" >/dev/null
    if [ "$(cat "$RUNNER_TEMP/registered")" == false ]; then
      return
    fi
    if [ $SECONDS -ge $deadline ]; then
      echo "::error::Runner $1 is still registered on GitHub after $2 minutes: $(cat "$RUNNER_TEMP/registered")"
      return 1
    fi
    sleep 30
  done
}

# no EC2 instance of a runner is left behind, waiting up to $2 minutes for them to terminate
assert_instances_gone() {
  local deadline=$((SECONDS + $2 * 60))
  local instances
  while true; do
    instances=$(aws ec2 describe-instances --query 'Reservations[].Instances[].InstanceId' --output text \
      --filters "Name=tag:GitHubRunners:Runner,Values=$1" "Name=instance-state-name,Values=pending,running,stopping,stopped")
    if [ -z "$instances" ]; then
      return
    fi
    if [ $SECONDS -ge $deadline ]; then
      echo "::error::Runner $1 still has instances after $2 minutes: $instances"
      return 1
    fi
    sleep 30
  done
}

# GitHub keeps a job without a runner queued for a whole day. fail fast by cancelling the run if job $1 is still queued after $2 minutes
assert_job_started() {
  local deadline=$((SECONDS + $2 * 60))
  local status
  while true; do
    # called workflows put the caller's job name in front
    status=$(gh api --paginate "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/attempts/$GITHUB_RUN_ATTEMPT/jobs" \
      --jq ".jobs[] | select(.name == \"$1\" or (.name | endswith(\" / $1\"))) | .status")
    if [ -n "$status" ] && [ "$status" != queued ]; then
      return
    fi
    if [ $SECONDS -ge $deadline ]; then
      echo "::error::Job $1 is still queued after $2 minutes, so nothing started a runner for it"
      gh run cancel "$GITHUB_RUN_ID"
      return 1
    fi
    sleep 30
  done
}
