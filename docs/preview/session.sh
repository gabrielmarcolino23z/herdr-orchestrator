#!/bin/sh
# Runs inside its own dbus session: a headless GNOME Shell (virtual 1600x1000 monitor, HiDPI) + the demo herdr-app.
. "$(dirname "$0")/env.sh"
unset DISPLAY
rm -f "$XDG_RUNTIME_DIR/pvdemo-wl" "$XDG_RUNTIME_DIR/pvdemo-wl.lock"   # stale ones from an earlier run
S=${PREVIEW_SCALE:-2}   # 2: a 3200x2000 monitor at scale 2, so shots are crisp (HiDPI) with a 1600x1000 layout
gnome-shell --headless --wayland --no-x11 --wayland-display=pvdemo-wl --virtual-monitor $((1600*S))x$((1000*S)) >"$DEMO/shell.log" 2>&1 &
SHELL_PID=$!
for i in $(seq 1 100); do [ -S "$XDG_RUNTIME_DIR/pvdemo-wl" ] && break; sleep 0.1; done
[ "$S" = 1 ] || python3 -I "$DEMO_SCRIPTS/scale.py" "$S" >>"$DEMO/shell.log" 2>&1
sleep 1
export WAYLAND_DISPLAY=pvdemo-wl
herdr-app >"$DEMO/app.log" 2>&1
kill $SHELL_PID
rm -f "$XDG_RUNTIME_DIR/pvdemo-wl" "$XDG_RUNTIME_DIR/pvdemo-wl.lock"
