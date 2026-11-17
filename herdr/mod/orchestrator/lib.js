// Shared pieces of the orchestrator mod's views. The orchestration itself lives in the skill's scripts
// (~/.agents/skills/herdr-orchestrator/scripts): the mod only shows and calls.
import { div } from "gpui-kit";
import { exec, hc, home, keys, readTextFile, shared } from "herdr";
import * as fs from "fs/promises";

export const base = (p) => (p ?? "").replace(/\/+$/, "").split("/").pop();

export const PHASE_COLOR = {
  planning: "ansi4",
  implementing: "working",
  verifying: "ansi3",
  reviewing: "ansi5",
  ready: "done",
  blocked: "blocked",
};

export const script = (name) => `${home()}/.agents/skills/herdr-orchestrator/scripts/${name}`;
export const workersDir = () => `${home()}/.local/state/herdr-orchestrator/workers`;

// Same as _common.orchestrator_name: hc names are 1-32 chars of a-z 0-9 - _.
export const orchestratorName = (repo) => `orchestrator-${base(repo)}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 32);

// The live terminal with that name, or null. `hc get` also answers for finished ones.
export async function live(name) {
  try {
    const r = await hc(["get", name, "--json"]);
    const d = r.code === 0 ? JSON.parse(r.stdout) : null;
    return d?.state === "live" ? d : null;
  } catch (_e) {
    return null;
  }
}

// Workers recorded by open-worker / worker-phase, for one repo (or all).
export async function readWorkers(repo = null) {
  let names = [];
  try {
    names = (await fs.readdir(workersDir())).filter((n) => n.endsWith(".json"));
  } catch (_e) {}
  const list = [];
  for (const n of names) {
    try {
      const w = JSON.parse((await readTextFile(`${workersDir()}/${n}`)) ?? "{}");
      if (!repo || w.repo_path === repo) list.push(w);
    } catch (_e) {}
  }
  return list.sort((a, b) => (a.repo ?? "").localeCompare(b.repo ?? "") || (a.issue ?? 0) - (b.issue ?? 0));
}

export const ensure = (args) => exec(script("ensure-projects"), args, { timeout: 120000 });
export const openUrl = (url) => { if (url) exec("xdg-open", [url]); };

export function button(t, id, text, onClick, strong = false) {
  return div().id(id).px(strong ? 10 : 7).py(strong ? 4 : 1).rounded(strong ? 6 : 4).border(1).border_color(t.border)
    .text_color(strong ? t.foreground : t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
    .on_click(onClick).child(text);
}

export function link(t, id, text, url) {
  return div().id(id).text_color(t.accent).font_semibold().flex_none()
    .hover((s) => s.text_color(t.foreground)).on_click(() => openUrl(url)).child(text);
}

export function phasePill(t, phase) {
  const c = t[PHASE_COLOR[phase]] ?? t.muted;
  return div().flex_none().px(6).rounded(4).bg(c + "1f").text_color(c).text_size(11).child(phase ?? "—");
}

// --- shared by the views ---------------------------------------------------

export const statePath = (name) => `${home()}/.local/state/herdr-orchestrator/${name}`;

// "now", "4m", "2h", "3d": how long since `ms`.
export function ago(ms) {
  if (!ms) return "";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// ui.json, written by `install` from the config: projects root, groups, publish commands.
export async function readUi() {
  try {
    return JSON.parse((await readTextFile(statePath("ui.json"))) ?? "{}");
  } catch (_e) {
    return {};
  }
}

// The project's publish command, from the config template ({branch}, {pr_file}, {issue}).
export function publishCommand(ui, w) {
  const tpl = ui?.publish?.[w.repo] ?? ui?.publish?.default ?? "gh pr create --head {branch} --body-file {pr_file}";
  return tpl.replaceAll("{branch}", w.branch ?? "").replaceAll("{issue}", String(w.issue))
    .replaceAll("{pr_file}", statePath(`pr/${w.repo}-${w.issue}.md`).replace(home(), "~"));
}

// --- keyboard shortcuts -----------------------------------------------------------------------------
// The key bound to an action, read live from keys.json (a rebind shows at once), formatted for a tooltip:
// "ctrl-shift-t" -> "Ctrl+Shift+T". Global keys, overridden by the shown layout's section; the terminal
// section only as a fallback. Same helper as in herdr/patches/tabs.patch (mods can't share code).
const KEY_NAMES = { ctrl: "Ctrl", shift: "Shift", alt: "Alt", cmd: "Cmd", super: "Super", pageup: "PgUp", pagedown: "PgDn", escape: "Esc", backspace: "Backspace", delete: "Del", insert: "Ins" };
export const keyLabel = (spec) => spec.split(" ").map((k) => (k.endsWith("--") ? [...k.slice(0, -2).split("-"), "-"] : k.split("-")).filter(Boolean)
  .map((p) => KEY_NAMES[p] ?? (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1))).join("+")).join(" ");

// shortcuts() -> key(...actions): the first key bound to any of them ("" if none); key.tip(text, ...actions):
// "text  Ctrl+Shift+A", or just text when nothing is bound. Build it once per render.
export function shortcuts() {
  const all = keys() ?? [], map = new Map(), fallback = new Map(), act = (a) => (typeof a === "string" ? a : a?.command ?? "");
  for (const s of ["global", `layout:${shared("layout")}`]) for (const k of all) if (k.section === s) map.set(k.keys, act(k.action));
  for (const k of all) if (k.section === "terminal" && !map.has(k.keys)) fallback.set(k.keys, act(k.action));
  const key = (...actions) => {
    for (const m of [map, fallback]) for (const [k, a] of m) if (actions.includes(a)) return keyLabel(k);
    return "";
  };
  key.tip = (text, ...actions) => { const k = key(...actions); return k ? `${text}  ${k}` : text; };
  return key;
}
