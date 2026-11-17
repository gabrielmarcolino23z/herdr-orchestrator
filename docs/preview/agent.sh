#!/bin/sh
# Fake agent terminal: [DELAY=s] agent.sh <app> <state> <msg> [transcript] [title] [kind]
# Prints a transcript (redrawn on resize; @@RULE@@ becomes a full-width rule), waits DELAY seconds,
# then reports its status over OSC 7501: key=value fields joined by ':', msg/title values base64.
# "done" is reported as a finished turn: working first, then done (a done that never worked shows idle).
app=$1 state=$2 msg=$3 file=$4 title=$5 kind=$6
draw() {
  cols=$(stty size 2>/dev/null | cut -d' ' -f2); [ -n "$cols" ] || cols=100
  rule=$(printf '%*s' "$cols" '' | sed 's/ /─/g')
  printf '\033[?25l\033[H\033[2J\033[3J'
  [ -n "$title" ] && printf '\033]0;%s\007' "$title"
  [ -n "$file" ] && [ -f "$file" ] && sed "s/@@RULE@@/$rule/" "$file"
}
osc() { # state [msg]
  rec="state=$1:app=$app"
  [ -n "$2" ] && rec="$rec:msg=$(printf %s "$2" | base64 -w0)"
  [ -n "$kind" ] && rec="$rec:kind=$kind"
  printf '\033]7501;%s\007' "$rec"
}
pause() { sleep "$1" & p=$!; while kill -0 $p 2>/dev/null; do wait $p; done; }
report() {
  if [ "$state" = done ]; then osc working "Wrapping up"; pause 3; osc done; else osc "$state" "$msg"; fi
}
trap draw WINCH
draw
[ -n "$DELAY" ] && pause "$DELAY"
report
while :; do pause 1000000; done
