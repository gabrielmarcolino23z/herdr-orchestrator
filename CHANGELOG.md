# Changelog

All notable changes to herdr-orchestrator. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-11-20

### Added
- **Folders fold.** Click a group label in **Projects** (the folder that holds the repos) to fold it. Folded, it reads "3 projects · 2 working" (in the accent color while agents work); the state is remembered.

### Fixed
- The demo installer (`docs/preview/install-demo.py`) no longer leaves a `__pycache__` in `skill/scripts`, which made the quick test's "no __pycache__ in the skill" check fail.

## [0.2.0] - 2026-11-17

### Added
- **Initialize git here.** Opening a folder that isn't a git repo from **+ New → Open a project** now explains that a project needs one and offers **Initialize git here** (`git init -b main`: no commit, no remote), then opens the project.
- `ensure-projects --create <dir> --init` does the same from the command line.
- `CONTRIBUTING.md`, issue and pull request templates, and this changelog.
- A `version` in the orchestrator mod's `mod.json`.

### Fixed
- **Sidebar tree lines:** the vertical connector no longer breaks between a worker and its next sibling when rows sit under the worker (its italic activity line, its reviewer, its helper terminals). Lines run unbroken, elbows meet each row's middle, and nested lines sit under the parent's status mark.
- **New chat dialog:** the **Where** project chips wrap onto more lines instead of being cut off at the dialog's edge (with six or more projects, **On its own** disappeared). The dialog grows to fit.
- **Open a project on a non-git folder** no longer fails with a vague "Not a project" toast: `ensure-projects --create` prints a clear error and exits with code 3 (missing folders and git worktrees get their own messages).
- **New projects stuck on Claude Code's folder trust dialog:** the orchestrator of a brand-new folder could stay blocked on "Yes, I trust this folder". Accepting it now polls up to 60 s, checks that the dialog went away and presses again if it didn't (keys sent while herdr adopts the terminal can be lost), without ever wrapping to "No, exit". `start-agent` uses the same helper, and the older "Do you trust the files in this folder?" dialog is recognized too.
- The **+ New** dialog no longer stays on "Opening…" if `ensure-projects` fails to run or times out.

## [0.1.0] - 2026-11-17

First public release.

- One **orchestrator** per project (a Claude Code session with its role as a system prompt) that opens a **worker** per GitHub issue, each in its own git worktree, branch and herdr space.
- Cross-harness review: Claude workers are reviewed by Codex and Codex workers by Claude, until `VERDICT: APPROVE`.
- The orchestrator sidebar, replacing herdr's Spaces and Agents lists: **Needs you** cards, **Projects** with their workers as a tree (phases, what each is doing, reviewers, helper terminals), **Chats** and **Other spaces**.
- The pinned **project** tab (orchestrator, workers, GitHub backlog with ▶ worker and ✕) and **Close project…**; projects that come back if closed by accident.
- Shipping that follows the target branch (`protected_branches`), and each repo's own `AGENTS.md` / `CLAUDE.md`.
- Resume after a reboot (`SessionStart` hook), a daily prune of finished worktrees, keyboard shortcuts with live tooltips.
- `install` (idempotent), quick and end-to-end tests, and a fake, isolated demo that produces every README image.

[Unreleased]: https://github.com/gabrielmarcolino23z/herdr-orchestrator/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/gabrielmarcolino23z/herdr-orchestrator/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/gabrielmarcolino23z/herdr-orchestrator/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/gabrielmarcolino23z/herdr-orchestrator/releases/tag/v0.1.0
