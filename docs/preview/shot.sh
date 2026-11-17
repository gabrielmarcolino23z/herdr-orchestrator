#!/bin/sh
# Captures the demo window only (HERDR_APP_HOME selects it): shot.sh [out.png]
out=${1:-preview.png}; case "$out" in /*) ;; *) out="$(pwd)/$out";; esac
. "$(dirname "$0")/env.sh"; cd /tmp
"$DEMO_SCRIPTS/focus.sh"; sleep 1
herdr-app shot "$out"
