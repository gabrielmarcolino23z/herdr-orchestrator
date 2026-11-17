#!/bin/sh
# Stops ONLY the demo: the herdr-app started with the demo HERDR_APP_HOME, and the pvdemo hc session.
. "$(dirname "$0")/env.sh"
pids=$("$DEMO_SCRIPTS/demo-pids.sh"); [ -n "$pids" ] && kill $pids
sleep 2
[ "$HC_SESSION" = pvdemo ] || exit 1
for t in $(hc ls --json | python3 -c 'import json,sys;[print(t["address"]) for t in json.load(sys.stdin)["terminals"]]'); do hc kill $t >/dev/null; done
hc server stop >/dev/null 2>&1
true
