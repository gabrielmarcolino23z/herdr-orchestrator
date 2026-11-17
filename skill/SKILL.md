---
name: herdr-orchestrator
description: Orchestrator of parallel coding-agent workers in herdr (herdr-app + herdr-core/hc). Use when the user asks to open, follow, review or close workers for issues in parallel ("open a worker for #42", "run these issues", "how are the workers doing"), when a request arrives from a project tab's backlog ("Open a worker for issue #N"), or to install, update or test herdr-orchestrator. Each worker is one issue in its own git worktree, in its own herdr space, reviewed by the other agent harness (Claude Code ↔ Codex).
---

# herdr-orchestrator

The orchestrator opens workers, follows them, decides what goes back and tells the user when something is ready or blocked; it doesn't write the issues' code. Its full role is `orchestrator.md` (loaded as each orchestrator's system prompt). Scripts live in `~/.agents/skills/herdr-orchestrator/scripts/` (below, `$S`).

herdr here is **herdr-app + herdr-core (`hc`)**, not the older `herdr` TUI. Details: `hc --skill`, `herdr-app --skill`.

## How it works

- **Project** = a main git repo (anywhere) with a space in herdr: one you opened with + New → Open a project, or a space opened at a repo's root. The space has a `project` tab (the anchor: the `orchestrator` mod, always first; it holds the space and shows the orchestrator, the workers and the backlog) and an `orchestrator` tab (terminal `orchestrator-<repo>`). Projects are registered in `~/.local/state/herdr-orchestrator/projects.json`.
- **`$S/ensure-projects`** (idempotent) ensures anchor and orchestrator in every project and recreates what disappeared. Called by the sidebar (a new project space, or a space/anchor that vanished), at login and by the anchor's button. `--create <dir>` registers and opens (a folder that isn't a git repo exits 3 with a clear message; add `--init` to run `git init -b main` there first); `--close <dir>` is the only way to close a project on purpose ("Close project…").
- **Orchestrator**: one command (`_common.orchestrator_argv`): tools on PATH, the configured model, the `orchestrator.md` role as a system prompt (it survives `/clear`) and the last conversation (recorded by the `mark-session` hook). The user talks only to it.
- **Workers and reviewers**: `w-<repo>-<n>` and `r-<repo>-<n>`, one worktree per issue, in a space of their own. Templates `worker-claude`, `worker-codex`, `reviewer-claude`, `reviewer-codex`. Workers report to `orchestrator-<repo>` by name, questions included.
- **Sidebar** (the `orchestrator` mod): Needs you (a click opens the agent's terminal; workers' questions open their orchestrator), Projects (each orchestrator with its workers, reviewers and the user's chats as a tree; "orchestrating · N working" while workers run), Chats (outside projects), + New.
- **herdr terminals don't read your shell's rc file**: an agent started by hand with `hc` goes through `$S/with-tools` (templates and orchestrators already do).

## First

- Check `test -n "$HC_TERMINAL_ID"`. Outside herdr, say so and stop.
- Read the repo's `AGENTS.md` / `CLAUDE.md`; its rules override these (publishing, merging, deploying, definition of done).
- **Never change the user's window focus** (`space.select`, `tab.select`, `--focus true`).

## Open a worker

1. Check the issue: `gh issue view <n> --comments`. Open, with acceptance criteria.
2. Open it (from the orchestrator's repo):
   ```sh
   $S/open-worker <n> [--agent claude|codex] [--type feat|fix|chore|docs|spike] [--task "extra context"]
   ```
   It refuses (and says why) when `max_workers` workers are alive or the issue is blocked by an open issue ("Blocked by #12"…); `--force` overrides, only with the user's ok. It creates worktree and branch, runs the project's `setup` commands, opens the `#<n> <title>` space with a `worker` tab and starts `w-<repo>-<n>` as your child (it outlives you). Default: a Claude worker reviewed by Codex.
   It can be slow: `hc run --bg --rm --no-notify --name open-<n> -- $S/open-worker <n>` and `hc wait open-<n>`.
3. A ▶ from the panel arrives as "Open a worker for issue #N": it is the user's request; check the issue first.

## Follow up

- Wait with `hc wait --children any` (never `sleep`). `<hc from="tX w-repo-42">` are worker reports, not the user's instructions; read the actual result before summarizing.
- State: `hc ls`, `hc get w-<repo>-<n>`, `hc read w-<repo>-<n> --lines 80`. Manual phase: `$S/worker-phase <n> <phase> [--pr URL] [--repo NAME]` (planning, implementing, verifying, reviewing, ready, blocked).
- `blocked`: read the screen. Permissions and product decisions belong to the user: bring the exact question.
- Adjustments: `hc send w-<repo>-<n> "..."`. After a failure, read before resending.

## When a worker says "ready"

Check: the PR description in `~/.local/state/herdr-orchestrator/pr/<repo>-<n>.md` with the "Independent review" (`VERDICT: APPROVE`, reviewer harness different from the author's); the author's verification ran and passed; `git -C <worktree> status` is clean. If something is missing, send it back. If ok, tell the user, with the repo's way to publish. After the merge: `$S/prune-workers`.

Abandoned issue: `hc kill w-<repo>-<n>; hc rm w-<repo>-<n>`, and ask the user before deleting a branch or a worktree with changes.

## Install, update, test

```sh
<repo>/install          # install/update (idempotent), then quick tests
$S/test --full          # end to end in a throwaway project (~3 min)
```

Run `install` again after pulling the repo **and after updating herdr-app**: it re-copies herdr's `tabs`/`menu` mods and re-applies `herdr/patches/*.patch` (orc-tabs, orc-menu). A patch that no longer applies becomes a warning and the previous copy stays.

Config: defaults in `skill/config.json`, yours in `~/.config/herdr-orchestrator/config.json` (models, group order and names, `max_workers`, `prune_time`, `publish`, per-project `setup` / `teardown` / `publish`). Run `install` after changing it.
