#!/bin/sh
# The fake reviewer, run through a demo hc template named reviewer-codex (so it shows as "reviewer · codex").
exec env DELAY=100 "$(dirname "$0")/agent.sh" codex working "Reviewing the diff against #45"
