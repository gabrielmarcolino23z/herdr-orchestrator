#!/bin/sh
# Regenerates every README image from the running demo (docs/preview/run.sh first, then wait ~5 min
# so the ages vary): preview.png (the whole window) and docs/images/*.png (close-ups). Run it once per
# run.sh: the last shot opens the api orchestrator, which settles its Needs you card.
# Talks only to the demo window (HERDR_APP_HOME) and the pvdemo hc session; the pointer moves only in
# the demo's own headless GNOME Shell (pointer.py). Crops with ffmpeg. Boxes are in window pixels
# (1600x968 layout), scaled by PREVIEW_SCALE.
set -e
D=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$D/../.." && pwd)
. "$D/env.sh"; cd /tmp
[ -n "$("$D/demo-pids.sh")" ] || { echo "the demo isn't running: docs/preview/run.sh"; exit 1; }
S=${PREVIEW_SCALE:-2}; IMG=$REPO/docs/images; RAW=$DEMO/shots
mkdir -p "$IMG" "$RAW"
do_() { herdr-app do "$@" >/dev/null; }
shot() { sleep "${2:-1.5}"; herdr-app shot "$RAW/$1.png" >/dev/null; }
crop() { # raw out x y w h
  ffmpeg -loglevel error -y -i "$RAW/$1.png" -vf "crop=$(($5*S)):$(($6*S)):$(($3*S)):$(($4*S))" "$IMG/$2.png"; }
point() { python3 -I "$D/pointer.py" "$@"; }
park() { point 1300 940; }   # out of the way: the empty bottom of the terminal
addr() { hc get "$1" --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["address"])'; }
tab_of() { # space-name tab-name -> tab id
  herdr-app ls | python3 -c "
import json,sys
for s in json.load(sys.stdin)['spaces']:
  for t in s['tabs']:
    if s['name']=='$1' and t['name']=='$2': print(t['id'])"; }
do_ overlay.close || true

# 1. the whole window: the storefront orchestrator, the sidebar with everything
park; "$D/focus.sh"; shot window
cp "$RAW/window.png" "$REPO/preview.png"
crop window sidebar     0  48 380 700   # Needs you, the Projects tree, Chats
crop window needs-you   0  48 380 196   # the cards
crop window tree        0 252 380 360   # storefront and api, expanded

# 2. a tooltip with its shortcut (hover "+ New")
point 339 67; shot tooltip
crop tooltip tooltip    0  48 840 110
park

# 3. the project tab
do_ tab.select --id "$(tab_of storefront project)"; shot project
crop project project-tab 388 46 1206 660
# and its "Close project…" dialog (opened with a click; it is only closed again, never confirmed)
point 1512 672 click; park; shot close
crop close close-dialog 556 356 488 256
do_ overlay.close
"$D/focus.sh"

# 4. the + New dialog (the sidebar's orchestrator.new command, as Ctrl+Shift+A sends it)
do_ orchestrator.new; shot new
crop new new-dialog    524 382 552 204
do_ overlay.close

# 5. a peek at a worker's terminal (what a click on a worker row does)
do_ terminal.peek --terminal "$(addr w-storefront-42)"; shot peek
crop peek peek         150  88 1300 440
do_ overlay.close

# 6. last, since looking at it settles its Needs you card: the api orchestrator bringing a decision
do_ pane.focus --terminal "$(addr orchestrator-api)"; shot decision
crop decision decision 388 46 1206 420
"$D/focus.sh"
ls -la "$REPO/preview.png" "$IMG"
