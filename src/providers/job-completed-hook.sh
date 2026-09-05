#!/bin/sh

set -e

# lambda copies everything to /tmp/runner
if [ -d /tmp/runner ]; then
  cd /tmp/runner
else
  cd $(dirname "$0")
fi

# run user hook if it exists
if [ -x job-completed-hook-user.sh ]; then
  exec ./job-completed-hook-user.sh
fi
