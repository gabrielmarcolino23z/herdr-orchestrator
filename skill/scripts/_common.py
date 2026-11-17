"""Single source of truth for herdr-orchestrator: paths, config, names, projects and the orchestrator command.

Every script imports from here. The `orchestrator` herdr mod does not repeat this logic: it calls the scripts.
"""
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True  # the skill lives in a repo / dotfiles: no __pycache__ in it

HOME = Path.home()
SCRIPTS = Path(__file__).resolve().parent
SKILL = SCRIPTS.parent
REPO = SKILL.parent
ROLE = SKILL / "orchestrator.md"
WITH_TOOLS = SCRIPTS / "with-tools"
STATE = HOME / ".local/state/herdr-orchestrator"
WORKERS = STATE / "workers"
ORCHESTRATORS = STATE / "orchestrators"
PR_DIR = STATE / "pr"
PROJECTS = STATE / "projects.json"
USER_CONFIG = HOME / ".config/herdr-orchestrator/config.json"
TEMPLATES = HOME / ".config/herdr-core/templates"

# Scripts are also run by herdr-app mods, whose PATH may lack ~/.local/bin and mise shims.
os.environ["PATH"] = f"{HOME}/.local/share/mise/shims:{HOME}/.local/bin:" + os.environ.get("PATH", "")

# Folder trust dialogs and the keys that accept each one.
TRUST_DIALOGS = [
    ("Yes, I trust this folder", ["down", "enter"]),  # Claude Code
    ("Trust and continue", ["enter"]),  # Codex: the option is already selected
]
READY_MARKERS = ("auto mode", "shift+tab", "Ask Codex", "? for shortcuts")


def _merge(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in over.items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def config() -> dict:
    """Defaults from skill/config.json, overridden by ~/.config/herdr-orchestrator/config.json."""
    data = json.loads((SKILL / "config.json").read_text())
    try:
        data = _merge(data, json.loads(USER_CONFIG.read_text()))
    except (OSError, ValueError):
        pass
    if os.environ.get("ORCHESTRATOR_MODEL"):  # tests use a cheap model without touching the config
        data["models"]["orchestrator"] = os.environ["ORCHESTRATOR_MODEL"]
    return data


def run(argv: list, cwd=None, timeout: int = 600) -> subprocess.CompletedProcess:
    return subprocess.run([str(a) for a in argv], cwd=cwd, capture_output=True, text=True, timeout=timeout, check=False)


def run_json(argv: list, cwd=None, timeout: int = 120):
    r = run(argv, cwd=cwd, timeout=timeout)
    if r.returncode != 0 or not r.stdout.strip():
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return None


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    tmp.replace(path)


def now_ms() -> int:
    return int(time.time() * 1000)


# --- names -------------------------------------------------------------------------------------

def _hc_name(text: str, limit: int = 32) -> str:
    """hc names: 1-32 chars of a-z 0-9 - _."""
    return re.sub(r"[^a-z0-9_-]", "-", text.lower())[:limit]


def orchestrator_name(repo: Path) -> str:
    return _hc_name(f"orchestrator-{repo.name}")


def worker_name(repo: Path, issue: int) -> str:
    return _hc_name(f"w-{repo.name}", 32 - len(str(issue)) - 1) + f"-{issue}"


def reviewer_name(repo: Path, issue: int) -> str:
    return _hc_name(f"r-{repo.name}", 32 - len(str(issue)) - 1) + f"-{issue}"


def worker_file(repo_name: str, issue: int) -> Path:
    return WORKERS / f"{repo_name}-{issue}.json"


def find_worker(issue: int, repo: str | None = None) -> Path | None:
    if repo:
        path = worker_file(repo, issue)
        return path if path.exists() else None
    matches = sorted(WORKERS.glob(f"*-{issue}.json"))
    return matches[0] if len(matches) == 1 else None


# --- terminals ---------------------------------------------------------------------------------

def is_live(name: str) -> bool:
    """`hc get` also answers for finished terminals: live means state == live."""
    return (run_json(["hc", "get", name, "--json"]) or {}).get("state") == "live"


def accept_trust(address: str, seconds: int = 20) -> str:
    """Wait for the agent to be ready, accepting a folder trust dialog on the way.
    Returns 'ready', 'accepted' or 'unknown' (some other screen)."""
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        screen = run(["hc", "read", address, "--lines", "0"]).stdout
        for marker, keys in TRUST_DIALOGS:
            if marker in screen:
                run(["hc", "keys", address, *keys])
                return "accepted"
        if any(m in screen for m in READY_MARKERS):
            return "ready"
        time.sleep(1)
    return "unknown"


def template_body(name: str) -> str:
    text = (TEMPLATES / f"{name}.md").read_text()
    parts = re.split(r"^---\s*$", text, maxsplit=2, flags=re.M)
    return (parts[2] if len(parts) == 3 else text).strip()


# --- projects ----------------------------------------------------------------------------------

def main_repo(path: str | Path) -> Path | None:
    """The root of the main repo (not a worktree) containing `path`. Projects live anywhere."""
    if not path or not Path(path).is_dir():
        return None
    top = run(["git", "rev-parse", "--path-format=absolute", "--show-toplevel"], cwd=path, timeout=10).stdout.strip()
    common = run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=path, timeout=10).stdout.strip()
    if not top or common != f"{top}/.git":
        return None
    return Path(top)


def registry() -> list[str]:
    return read_json(PROJECTS).get("repos", [])


def save_registry(repos) -> None:
    write_json(PROJECTS, {"repos": sorted(set(repos))})


def last_orchestrator_session(repo: Path) -> str:
    """The last session of this repo's orchestrator, if its transcript still exists (else a new one)."""
    sid = read_json(ORCHESTRATORS / f"{orchestrator_name(repo)}.json").get("session") or ""
    transcript = HOME / ".claude/projects" / re.sub(r"[^A-Za-z0-9]", "-", str(repo)) / f"{sid}.jsonl"
    return sid if sid and transcript.exists() else ""


def orchestrator_argv(repo: Path, resume: bool = True) -> list[str]:
    """The orchestrator command, the same everywhere (open, reopen, resume after a reboot): tools on
    PATH, the configured model, the role as a system prompt, and the last conversation."""
    sid = last_orchestrator_session(repo) if resume else ""
    return [str(WITH_TOOLS), "claude", "--model", config()["models"]["orchestrator"],
            "--append-system-prompt-file", str(ROLE), *(["--resume", sid] if sid else [])]
