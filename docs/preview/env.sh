# Sourced by the other scripts: an isolated demo (own HOME, own hc session, own herdr-app home).
# Never points at your real herdr-app window or your default herdr-core session.
unset HC_TERMINAL_ID HC_TERMINAL_SOCKET HC_SCOPE HC_SOCKET
DEMO_SCRIPTS=$(cd "$(dirname "$0")" && pwd); export DEMO_SCRIPTS
_bin=$(dirname "$(command -v herdr-app)")
export DEMO=${PREVIEW_DIR:-/tmp/herdr-preview}   # short path: unix socket length limit; shows as ~ in the shot
export HOME=$DEMO/home
export XDG_CONFIG_HOME=$HOME/.config XDG_STATE_HOME=$HOME/.local/state XDG_DATA_HOME=$HOME/.local/share XDG_CACHE_HOME=$HOME/.cache
export HC_SESSION=pvdemo
export HERDR_APP_HOME=$HOME/.config/herdr-app
export HERDR_TELEMETRY=0 HERDR_APP_NO_SOUND=1
export HERDR_RELEASES_URL=http://127.0.0.1:9   # no update checks/downloads from the demo
export PATH=$DEMO_SCRIPTS/bin:$_bin:/usr/bin:/bin   # bin/: offline gh (fake backlog) and a fake bun
mkdir -p "$HOME"
