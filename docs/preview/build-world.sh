#!/bin/sh
# Builds the fake world in the isolated hc session (HC_SESSION=pvdemo) and the demo state dir.
set -e
. "$(dirname "$0")/env.sh"
A=$DEMO_SCRIPTS/agent.sh T=$DEMO_SCRIPTS/transcripts
R=$HOME/demo; ST=$HOME/.local/state/herdr-orchestrator
mkdir -p $ST/workers $ST/pr $R/scratch
for r in acme/storefront acme/api oss/docs-site; do
  [ -d $R/$r/.git ] || { mkdir -p $R/$r && git -C $R/$r init -q -b main && git -C $R/$r -c user.name=demo -c user.email=demo@example.com commit -q --allow-empty -m init; }
done
hex() { python3 -c 'import secrets;print(secrets.token_hex(16))'; }
addr() { python3 -c 'import json,sys;print(json.load(sys.stdin)["address"])'; }
now=$(date +%s%3N)
cat > $ST/projects.json <<J
{"repos": ["$R/acme/storefront", "$R/acme/api", "$R/oss/docs-site"]}
J
: > $DEMO/spaces.txt
# run <space-file-key> <name> <cwd> <delay> <args...> ; extra hc args via $X
run() {
  key=$1 name=$2 cwd=$3 delay=$4; shift 4
  sp=$(grep "^$key " $DEMO/spaces.txt | cut -d' ' -f2) || true
  if [ -z "$sp" ]; then sp=sp$(hex); tb=tb$(hex); echo "$key $sp $tb" >> $DEMO/spaces.txt; else tb=tb$(hex); echo "$key-tab-$name $sp $tb" >> $DEMO/spaces.txt; fi
  hc run --bg --keep --name "$name" --cwd "$cwd" --label herdr.space=$sp --label herdr.tab=$tb $X -- env DELAY=$delay "$A" "$@" | addr
}
rec() { # repo issue title phase branch
  cat > $ST/workers/$1-$2.json <<J
{"repo": "$1", "repo_path": "$6", "issue": $2, "title": "$3", "url": "https://github.com/acme/$1/issues/$2",
 "branch": "$5", "base": "origin/main", "worktree": "$6-$2", "name": "w-$1-$2", "agent": "claude",
 "phase": "$4", "phase_since": $now, "note": "", "created": $((now-3600000)), "updated": $now}
J
}
SF=$R/acme/storefront API=$R/acme/api DOCS=$R/oss/docs-site
X=""
o_sf=$(run storefront orchestrator-storefront $SF 0 claude-code idle "" $T/orch-storefront.txt)
o_api=$(run api orchestrator-api $API 100 claude-code done "" $T/orch-api.txt)
o_docs=$(run docs-site orchestrator-docs-site $DOCS 45 claude-code blocked "Permission: open-worker 7" $T/orch-docs.txt)
X="--parent $o_sf --label repo=storefront --label issue=42"
run w42 w-storefront-42 $SF 120 claude-code working "Writing the ApplePaySession handler" $T/worker-42.txt >/dev/null
X="--parent $o_sf --label repo=storefront --label issue=45"
w45=$(run w45 w-storefront-45 $SF 30 claude-code idle "" $T/worker.txt)
X="--parent $o_sf --label repo=storefront --label issue=39"
w39=$(run w39 w-storefront-39 $SF 90 claude-code working "Running Lighthouse on /products" $T/worker.txt)
X="--parent $o_api --label repo=api --label issue=18"
run w18 w-api-18 $API 60 claude-code done "" $T/worker.txt >/dev/null
X="--parent $o_api --label repo=api --label issue=21"
run w21 w-api-21 $API 150 claude-code working "Reading the orders query and cursor helpers" $T/worker.txt >/dev/null
# the reviewer: a sub-agent of worker #45, no pane (no herdr labels)
mkdir -p $HOME/.config/herdr-core/templates
printf -- '---\nname: reviewer-codex\ndescription: demo reviewer\ncommand: %s\n---\nReview the diff.\n' "$DEMO_SCRIPTS/reviewer.sh" > $HOME/.config/herdr-core/templates/reviewer-codex.md
hc run --bg --keep --name r-storefront-45 --cwd $SF --parent $w45 reviewer-codex "Review #45" >/dev/null
# a helper terminal of worker #39 (its test suite, a fake bun from bin/): shows as "tests · bun test"
hc run --bg --keep --name w-storefront-39-tests --cwd $SF --parent $w39 -- bun test >/dev/null
# your chat in the docs-site project, and one chat outside any project
X=""
run docs-site chat-docs $DOCS 20 claude-code idle "" "" "Proofread the install guide" >/dev/null
run scratch chat-scratch $R/scratch 140 claude-code working "Comparing job queue libraries" "" "Compare job queue libraries" >/dev/null
rec storefront 42 "Add Apple Pay to checkout" implementing feat/42-add-apple-pay-checkout $SF
rec storefront 45 "Fix cart total rounding on discounts" reviewing fix/45-fix-cart-total-rounding $SF
rec storefront 39 "Lazy-load product images" verifying perf/39-lazy-load-product-images $SF
rec api 18 "Rate-limit the public webhooks endpoint" ready feat/18-rate-limit-webhooks $API
rec api 21 "Paginate GET /orders" planning feat/21-paginate-orders $API
hc ls
