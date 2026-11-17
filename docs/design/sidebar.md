# Sidebar design

Status: shipped (v5), 2026-11-16. Prototyped first; the prototype's lessons are kept below.

## One rule

**Everything is a chat with an agent. A chat opened in a project belongs to it. You talk to the orchestrator.**

- **Orchestrator**: one per project, the only agent you talk to. It delegates, follows, and relays what needs you.
- **Worker**: one per issue, opened by the orchestrator, in its own worktree and space. It reports to `orchestrator-<repo>` by name, questions included.
- **Reviewer**: a sub-agent of a worker, from the other harness.
- **Your chats**: any other agent. Inside a project's folder it belongs to that project; outside every project it goes under Chats.

## The sidebar (one mod, replacing herdr's Spaces and Agents lists)

```
                                   [+ New]
NEEDS YOU                              2
 ! api › Orchestrator                 3m
   #15 asks: 60 or 120 requests/min?   ✓
 ✓ web-app › Orchestrator            12m
   #12 Dark mode is ready to publish   ✓
PROJECTS
 Work
 ▾ api        ▮▮▮ orchestrating · 2 working
   ├─ ● #15 Rate-limit the public API  blocked   3m
   ├─ ⟳ #18 Migrate users to v2       reviewing  9m
   │  └─ ⟳ reviewer · codex                       1m
   └─ ● your chat · fixing the CSS build          2h
 ▸ web-app    idle 40m
CHATS                                not in a project
 ● Geral · planning the week                     now
▸ Other spaces (2)
```

- **Needs you**: a worker's question or "ready to publish" (both through its orchestrator), an agent asking for permission, an orchestrator that replied. **A click opens that agent's terminal in herdr**: the orchestrator for questions and ready, the agent itself for permission dialogs. ✓ hides an item until its source changes. Merged or closed PRs clear "ready" by themselves.
- **Projects**: grouped by the folder holding the repo. The project row's name opens its orchestrator, and the chevron folds. The orchestrator's state is on the row; **"orchestrating · N working" (animated) whenever its workers run** and it doesn't, so it never looks idle while it orchestrates. Below it is the tree of workers, reviewers and your chats. Every row shows the time in its current state.
- **Chats**: agents outside any project, always visible.
- **+ New**: Open a project (system folder picker: any repo, wherever you keep it) or New chat (in a project, as a tab in its space; or on its own, as a new space).

## What the prototype taught us

- **A separate Details panel confused more than it helped.** Clicking should take you to the conversation, where you can read and answer, so the panel was dropped.
- **Creating or cloning repos was out of scope.** People already organize their folders; we only open what exists.
- **Questions should come through the orchestrator,** so there is one place to talk. Permission dialogs are the exception: they live in the worker's terminal.
- **Your own chat must never be hidden** in "Other agents".
- **The Spaces list was dead weight** once projects and chats were listed by meaning.

## Data

- **Worker records:** `~/.local/state/herdr-orchestrator/workers/<repo>-<n>.json` (phase, note, PR, times), written by `open-worker` and `worker-phase`. Phase changes also go to `events.jsonl`.
- **Live state:** `terminals()` (name, parent, `labels.repo`, `status_ms`), `agents()` (status) and `spaces()`.
- **Projects:** the registry `projects.json` plus spaces sitting at a repo's root.
- **Hidden items:** shared state `orchestrator.inbox`.
