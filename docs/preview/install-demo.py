# Runs the repo's own install steps (mod, patched tabs/menu, layout, ui.json) against the demo HOME only.
# Skips: skill links, hc templates, systemd/autostart, hooks, tests.
import os, sys, importlib.util, importlib.machinery
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.argv = ["install"]
sys.path.insert(0, REPO + "/skill/scripts")
loader = importlib.machinery.SourceFileLoader("inst", REPO + "/skill/scripts/install")
spec = importlib.util.spec_from_loader("inst", loader); m = importlib.util.module_from_spec(spec); loader.exec_module(m)
assert str(m.APP).startswith(os.environ["DEMO"] + "/"), m.APP
for f in (m.orchestrator_mod, m.patched_mods, m.layout, m.ui_json):
    f()
print(m.warnings)
