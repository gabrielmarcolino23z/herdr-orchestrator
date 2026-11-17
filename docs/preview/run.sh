#!/bin/sh
# Regenerates preview.png from a fake, isolated world: fake repos under ~/demo (HOME=$PREVIEW_DIR/home),
# fake agents in their own hc session (HC_SESSION=pvdemo), and a second herdr-app with its own
# HERDR_APP_HOME, shown in a headless GNOME Shell (own dbus session, virtual 1600x1000 monitor).
# Your herdr-app window and default hc session are never touched.
#   docs/preview/run.sh            build and open the demo (Linux, GNOME Shell needed)
#   (wait ~5 min: the sidebar's ages count from each agent's last status)
#   docs/preview/shot.sh preview.png
#   docs/preview/down.sh           stop the demo app and the pvdemo session
D="$(cd "$(dirname "$0")" && pwd)"
. "$D/env.sh"
case "$DEMO" in /*/*) ;; *) echo "bad DEMO=$DEMO"; exit 1;; esac
"$D/down.sh" 2>/dev/null
rm -rf "$HOME/.local/state/herdr-core" "$HOME/.local/state/herdr-orchestrator/workers"
mkdir -p "$HOME/.config/herdr-orchestrator" "$HERDR_APP_HOME"
[ -f "$HOME/.config/herdr-orchestrator/config.json" ] || echo '{ "groups": { "order": ["acme", "oss"], "names": { "acme": "Acme", "oss": "Open source" } } }' > "$HOME/.config/herdr-orchestrator/config.json"
"$D/build-world.sh" >/dev/null
# a fresh app home: dark, quiet, welcome already seen, maximized
python3 -I - <<'PY'
import json, os, subprocess
h = os.environ["HERDR_APP_HOME"]
def upd(name, f):
    p = f"{h}/{name}"; d = json.load(open(p)) if os.path.exists(p) else {}; f(d); json.dump(d, open(p, "w"), indent=2)
upd("settings.json", lambda d: d.update(appearance="dark", sounds={"enabled": False}))
upd("shared.json", lambda d: d.update({"frame.welcomed": "finished"}))
ver = subprocess.run(["herdr-app", "--version"], capture_output=True, text=True).stdout.split()[-1]
upd("update-notes.json", lambda d: d.update(last_run=ver, presented=d.get("presented", [])))  # no "Updated to" pill
upd("window.json", lambda d: d.update(state="maximized", bounds=[0.0, 0.0, 1600.0, 1000.0]))
PY
setsid dbus-run-session -- "$D/session.sh" </dev/null >/dev/null 2>&1 &
cd /tmp
for i in $(seq 1 60); do herdr-app status >/dev/null 2>&1 && break; sleep 0.5; done
sleep 3
# the repo's own install steps, on a personal clone of the main layout
[ -f "$HERDR_APP_HOME/layouts/orchestrator.json" ] || herdr-app do layout.clone --name main --as orchestrator >/dev/null
python3 -I "$D/install-demo.py"
herdr-app do layout.switch --name orchestrator >/dev/null
herdr-app do layout.resize --id sidebar --px 380 >/dev/null
"$D/app-setup.sh"
"$D/focus.sh"
