# Contributing

Thanks for helping. herdr-orchestrator is small on purpose: a herdr-app mod that shows state, Python scripts that do the orchestration, and two patches to herdr's own mods. Read [RECIPE.md](RECIPE.md) first: it describes what the sidebar shows, how it behaves and what tripped earlier builds up.

## Where things are

| Path | What |
|---|---|
| `herdr/mod/orchestrator/` | the `orchestrator` mod: views `sidebar`, `new`, `project`, `close` (gpui-kit JavaScript) |
| `herdr/patches/` | `tabs.patch` and `menu.patch`, applied to herdr's shipped `tabs` and `menu` mods as `orc-tabs` / `orc-menu` |
| `herdr/templates/` | the hc templates for workers and reviewers |
| `skill/` | the agent skill: `SKILL.md`, the orchestrator's role (`orchestrator.md`), defaults (`config.json`) and `scripts/` |
| `docs/preview/` | the fake, isolated demo that produces every README image |

## Set up

```sh
git clone https://github.com/gabrielmarcolino23z/herdr-orchestrator
cd herdr-orchestrator
./install            # idempotent; ./install --no-tests skips the quick tests
```

`install` copies the mod into `~/.config/herdr-app/mods/orchestrator` and links the skill to this checkout, so script edits apply at once. **After editing the mod, run `./install` again** (herdr-app hot-reloads it), then check:

```sh
herdr-app check ~/.config/herdr-app/mods/orchestrator
herdr-app status     # "errors": []
```

Mods are gpui-kit, not the web: read `~/.config/herdr-app/AGENTS.md`, `herdr.d.ts` and `gpui-kit.d.ts` (the type files are the truth for your herdr-app version). Never keep a `cx` beyond its callback; `new` is a reserved word (the view object is `newDialog`).

## Tests

```sh
skill/scripts/test           # quick: ~36 checks (syntax, mod checks, layout, templates, hooks, dry runs)
skill/scripts/test --full    # + end to end in a throwaway project (~3 min, a cheap model)
```

`--full` creates a real project in your temp folder, opens an orchestrator and a worker in your herdr, and cleans everything up, even on failure. It never changes window focus. If the quick test complains about `__pycache__`, delete `skill/scripts/__pycache__`.

## See it: the demo

Every picture in the README comes from a fake, isolated world: fake repos and agents, its own `HOME`, its own hc session (`HC_SESSION=pvdemo`) and its own herdr-app window in a headless GNOME Shell. Your herdr-app and your default hc session are never touched.

```sh
docs/preview/run.sh      # build and open the demo (Linux; needs GNOME Shell, python3-gi, ffmpeg)
# wait ~5 minutes, so the ages in the sidebar vary
docs/preview/shots.sh    # regenerates preview.png and docs/images/*.png
docs/preview/down.sh     # stop it
```

A UI change should come with regenerated images, and you should look at them before opening the PR. `python3 -I docs/preview/install-demo.py` (with `docs/preview/env.sh` sourced) re-installs the mod into a running demo.

## Patches to herdr's tabs and menu mods

herdr's shipped mods are read-only and replaced on every herdr-app update, so `install` copies `tabs` and `menu` and applies `herdr/patches/*.patch` to make `orc-tabs` and `orc-menu`. When a herdr-app update makes a patch stop applying (`install` warns), refresh it:

```sh
REPO=$PWD                      # this checkout
tmp=$(mktemp -d) && mkdir -p "$tmp/a" "$tmp/b"
cp -r ~/.config/herdr-app/mods/tabs "$tmp/a/tabs"   # herdr's current, pristine mod
cp -r ~/.config/herdr-app/mods/tabs "$tmp/b/tabs"
(cd "$tmp/b" && patch -p1 --merge < "$REPO/herdr/patches/tabs.patch")   # then fix the conflicts in b/tabs/main.js
(cd "$tmp" && diff -u a/tabs/main.js b/tabs/main.js) > "$REPO/herdr/patches/tabs.patch"
```

The patch paths are `a/tabs/main.js` → `b/tabs/main.js` (applied with `patch -p1`); the same goes for `menu`. Keep patches minimal and mark added code with an `// orc:` comment. Run `./install` and the quick tests afterwards.

## Pull requests

- **Small and focused:** one fix or feature per PR. Open an issue first for anything larger.
- **English** for code, comments, commits, docs and UI text. Plain words, short sentences; match the tone of the README.
- Run the quick tests (and `--full` when you touch the scripts' create/open/worker paths). Say in the PR what you checked by hand.
- UI changes: include before/after images, ideally from the demo.
- No personal data: no real project names, user names or home paths in code, docs, images or tests (the demo uses the fake Acme repos).
- Add a line to `CHANGELOG.md` under **Unreleased**.

## License

By contributing you agree that your contributions are licensed under the Apache-2.0 license of this repository.
