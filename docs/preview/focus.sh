#!/bin/sh
# Shows the storefront orchestrator in the demo window and closes toasts.
. "$(dirname "$0")/env.sh"; cd /tmp
set -- $(herdr-app ls | python3 -c "
import json,sys;d=json.load(sys.stdin)
for s in d['spaces']:
  for tab in s['tabs']:
    for t in tab['terminals']:
      if t['name']=='orchestrator-storefront': print(s['id'],tab['id'],t['terminal'])")
herdr-app do space.select --id $1 >/dev/null; herdr-app do tab.select --id $2 >/dev/null
herdr-app do pane.focus --terminal $3 >/dev/null; herdr-app do overlay.close --id toast >/dev/null
