#!/bin/sh
# PIDs of herdr-app processes started with the demo HERDR_APP_HOME (never yours).
. "$(dirname "$0")/env.sh"
for p in $(pgrep -x herdr-app); do
  tr '\0' '\n' < /proc/$p/environ 2>/dev/null | grep -qx "HERDR_APP_HOME=$HERDR_APP_HOME" && echo $p
done
