#!/bin/sh
# Arranges the demo herdr-app window like ensure-projects/open-worker would (demo instance only).
. "$(dirname "$0")/env.sh"
cd /tmp
python3 -I - <<'PY'
import json, subprocess
def do(*a):
    r = subprocess.run(["herdr-app", "do", *a], capture_output=True, text=True)
    try: return json.loads(r.stdout)
    except Exception: return {}
ls = json.loads(subprocess.run(["herdr-app", "ls"], capture_output=True, text=True).stdout)
titles = {"42": "#42 Add Apple Pay to checkout", "45": "#45 Fix cart total rounding", "39": "#39 Lazy-load product images",
          "18": "#18 Rate-limit webhooks", "21": "#21 Paginate GET /orders"}
for sp in ls["spaces"]:
    names = [t["name"] for tab in sp["tabs"] for t in tab["terminals"]]
    if any(n.startswith("orchestrator-") for n in names):
        for tab in sp["tabs"]:
            if any(t["name"].startswith("orchestrator-") for t in tab["terminals"]):
                do("tab.rename", "--id", tab["id"], "--name", "orchestrator")
            elif any(t["name"].startswith("chat-") for t in tab["terminals"]):
                do("tab.rename", "--id", tab["id"], "--name", "chat")
        if not any(tab["name"] == "project" for tab in sp["tabs"]):
            made = do("tab.new", json.dumps({"space": sp["id"], "name": "project", "mod": "orchestrator", "props": {"view": "project"}, "focus": False}))
            tid = (made.get("result") or made).get("id") or (made.get("result") or made).get("tab")
            if tid: do("tab.move", "--id", tid, "--index", "1")
            print("project tab", sp["name"], made)
    elif names and names[0].startswith("w-"):
        do("space.rename", "--id", sp["id"], "--name", titles[names[0].rsplit("-", 1)[1]])
        do("tab.rename", "--id", sp["tabs"][0]["id"], "--name", "worker")
    elif names and names[0].startswith("chat-"):
        do("tab.rename", "--id", sp["tabs"][0]["id"], "--name", "chat")
PY
