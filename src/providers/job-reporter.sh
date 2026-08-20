#!/bin/bash

set -e

# Change directory to the folder where this script lives (Lambda copies to /tmp/runner)
cd "$(dirname "$0")"

RUNNER=$1
LOG=$2

if [ -z "$LOG" ]; then
  (
    while [ ! -s .workflowid ]; do sleep 1; done
    WORKFLOW=`head -n 1 .workflowid`
    # NONE means --stop woke us up because no job ever arrived. there is nothing to report and printing it anyway
    # would send an unparsable line to the detector for every runner that idles out.
    [ "$WORKFLOW" != NONE ] && echo CDKGHR JOB RUNNER=$RUNNER $WORKFLOW
  ) &
else
  (
    while [ ! -s .workflowid ]; do sleep 1; done
    WORKFLOW=`head -n 1 .workflowid`
    # NONE means --stop woke us up because no job ever arrived. there is nothing to report and printing it anyway
    # would send an unparsable line to the detector for every runner that idles out.
    [ "$WORKFLOW" != NONE ] && echo CDKGHR JOB RUNNER=$RUNNER $WORKFLOW
  ) &> $LOG &
fi
