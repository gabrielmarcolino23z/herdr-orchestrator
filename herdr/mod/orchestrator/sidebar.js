// "sidebar" view: the whole sidebar list (it replaces herdr's Spaces and Agents lists).
//   NEEDS YOU   what needs you; a click opens that agent's terminal (a worker's question or "ready"
//               opens its orchestrator, who asks you; a permission dialog opens the agent itself).
//   PROJECTS    each project's orchestrator (the one you talk to) with its workers, their reviewers
//               and your own chats in that repo, as a tree, with time in state. While its workers run,
//               an orchestrator shows "orchestrating · N working" instead of looking idle.
//   CHATS       agents that aren't in any project.
//   Other spaces (folded): spaces with no agent.
// Keys (keys.json, installed by `install` when free): orchestrator.new opens the "+ New" dialog,
// orchestrator.needs-you opens the first NEEDS YOU card, orchestrator.project the current project's
// orchestrator. They reach this copy only while the sidebar is shown. Tooltips name the bound keys.
// It also keeps projects alive: a project space without its "project" tab, or a registered project
// without a space, is handed to ensure-projects. Design: docs/design/sidebar.md.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, spaces, focused, theme, exec, hc, run, shared, setShared, notify, checking, watchFolder, readTextFile, openOverlay, settings, nextCommand, setAgentOrder } from "herdr";
import { ago, base, ensure, orchestratorName, phasePill, readUi, readWorkers, script, shortcuts, statePath, workersDir } from "./lib.js";

// Tree geometry (px). Rows are ROW_H tall and the row's text sits in the middle; TREE_MID puts the elbow's
// line (TREE_LINE thick, drawn inside the box) on that middle. A nested level is indented by TREE_INDENT so
// its line falls under the middle of the parent row's status mark (a 10px mark after a 6px gap: 6 + 5).
const ROW_H = 25;
const TREE_LINE = 1.5;
const TREE_MID = ROW_H / 2 + TREE_LINE / 2;
const TREE_SLOT = 10;
const TREE_INDENT = 11;

const norm = (s) => (s === "done" ? "idle" : s ?? "none"); // looking at a done agent turns it idle: not news
const inside = (p, root) => Boolean(p) && (p === root || p.startsWith(root + "/"));

export const sidebar = {
  start(cx) {
    this.workers = [];
    this.registry = [];
    this.ui = {};
    this.since = {}; // address -> { s, at }
    this.top = {}; // space folder -> repo root ("" when not a repo root), cached
    this.ensured = new Map();
    this.otherOpen = false;

    try { this.expanded = JSON.parse(localStorage.getItem("orchestrator.expanded") ?? "{}"); } catch (_e) { this.expanded = {}; }
    this.reload(cx);
    cx.timer.every(15000, (cx) => this.reload(cx));
    cx.timer.every(30000, (cx) => cx.notify()); // ages move on
    cx.timer.every(5000, () => this.keepProjects());
    cx.timer.every(120000, (cx) => this.autoSettle(cx));
    if (checking()) return;
    cx.spawn(async (cx) => {
      for (;;) {
        let c;
        try { c = await nextCommand(); } catch (_e) { return; }
        this.command(c, cx);
        cx.notify();
      }
    });
    cx.spawn(async (cx) => {
      await exec("mkdir", ["-p", workersDir()]);
      for (;;) {
        try {
          await watchFolder(workersDir());
        } catch (_e) {
          return;
        }
        this.reload(cx);
      }
    });
  },

  reload(cx) {
    cx.spawn(async (cx) => {
      this.workers = await readWorkers();
      this.ui = await readUi();
      try { this.registry = JSON.parse((await readTextFile(statePath("projects.json"))) ?? "{}").repos ?? []; } catch (_e) {}
      cx.notify();
    });
  },

  // Repo root of a space folder, only when the folder IS that root (a project space), cached.
  rootOf(folder, cx) {
    if (!folder || folder in this.top) return this.top[folder] ?? "";
    this.top[folder] = "";
    if (checking()) return "";
    cx.spawn(async (cx) => {
      try {
        const [t, c] = await Promise.all([
          exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd: folder, timeout: 8000 }),
          exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, timeout: 8000 }),
        ]);
        const top = t.stdout.trim();
        if (t.code === 0 && c.stdout.trim() === `${top}/.git` && top === folder) this.top[folder] = top;
      } catch (_e) {}
      cx.notify();
    });
    return "";
  },

  // Safety net: project spaces keep their "project" tab; registered projects keep a space.
  keepProjects() {
    if (checking() || !this.projectSpaces) return;
    const now = Date.now();
    const due = (k) => now - (this.ensured.get(k) ?? 0) > 30000;
    for (const [repo, sp] of this.projectSpaces) {
      if (!sp.tabs.some((c) => c.name === "project") && due(sp.id)) {
        this.ensured.set(sp.id, now);
        exec(script("ensure-projects"), ["--space", sp.id], { timeout: 120000 }).catch(() => {});
      }
    }
    const missing = this.registry.filter((r) => !this.projectSpaces.has(r));
    if (!missing.length) { this.missingSince = null; return; }
    this.missingSince ??= now;
    if (now - this.missingSince > 8000 && due("*")) {
      this.ensured.set("*", now);
      exec(script("ensure-projects"), [], { timeout: 180000 }).catch(() => {});
    }
  },

  autoSettle(cx) {
    if (checking()) return;
    cx.spawn(async (cx) => {
      for (const w of this.workers.filter((w) => w.phase === "ready" && w.pr)) {
        try {
          const r = await exec("gh", ["pr", "view", w.pr, "--json", "state", "--jq", ".state"], { cwd: w.repo_path, timeout: 20000 });
          if (["MERGED", "CLOSED"].includes(r.stdout.trim())) this.settle(`ready:${w.repo}:${w.issue}`, w.updated);
        } catch (_e) {}
      }
      cx.notify();
    });
  },

  stateSince(address, status, seed) {
    const s = norm(status);
    const prev = this.since[address];
    if (!prev || prev.s !== s) this.since[address] = { s, at: prev ? Date.now() : (seed || Date.now()) };
    return this.since[address].at;
  },

  settled() { return shared("orchestrator.inbox") ?? {}; },
  settle(key, version) { setShared("orchestrator.inbox", { ...this.settled(), [key]: { settled: Date.now(), at: version } }); },

  // Open an agent's terminal in herdr: its pane, or a peek for a sub-agent without one.
  openAgent(address, hasPane) {
    if (!address) return;
    run(hasPane ? "pane.focus" : "terminal.peek", { terminal: address });
  },

  openOrchestrator(repo, cx) {
    const t = terminals().find((x) => x.state === "live" && x.name === orchestratorName(repo));
    if (t) return this.openAgent(t.address, true);
    cx.spawn(async (cx) => {
      notify({ title: `Opening ${base(repo)}'s orchestrator…`, level: "info" });
      await ensure(["--repo", repo]);
      const n = terminals().find((x) => x.state === "live" && x.name === orchestratorName(repo));
      if (n) this.openAgent(n.address, true);
      cx.notify();
    });
  },

  // --- keys (orchestrator.<command> in keys.json) -------------------------------------------------
  command(c, cx) {
    if (c === "new") return this.openNew();
    if (c === "needs-you") {
      const it = this.lastItems?.[0];
      if (it) return this.openAgent(it.target, it.pane);
      return notify({ title: "Nothing needs you", level: "info" });
    }
    if (c === "project") {
      const repo = this.currentProject();
      if (repo) return this.openOrchestrator(repo, cx);
      return notify({ title: "Not in a project", body: "Go to a project's space (or one of its agents) first.", level: "info" });
    }
  },

  openNew() {
    openOverlay({ mod: "orchestrator", kind: "dialog", width: 520, props: { view: "new" } });
  },

  // The project you're in: the shown space's repo, else the focused agent's (a worker's record, or its folder).
  currentProject() {
    const repos = [...new Set([...(this.projectSpaces?.keys() ?? []), ...this.registry])];
    const sp = spaces().find((s) => s.active);
    for (const [repo, s] of this.projectSpaces ?? []) if (s.id === sp?.id) return repo;
    const f = focused();
    const x = f?.terminal ? terminals().find((k) => k.address === f.terminal) : null;
    const rec = x ? this.workers.find((w) => w.name === x.name) : null;
    if (rec?.repo_path) return rec.repo_path;
    const cwd = f?.cwd ?? x?.cwd ?? sp?.folder;
    return repos.filter((r) => inside(cwd, r)).sort((a, b) => b.length - a.length)[0] ?? null;
  },

  // --- marks ------------------------------------------------------------------------------------
  mark(t, s) {
    if (s === "working") return svg("mods/workspace-chrome/spinner.svg").size(10).flex_none().text_color(t.working).spin(900);
    return div().size(7).mx(1.5).flex_none().rounded(4)
      .when(s === "blocked", (el) => el.bg(t.blocked)).when(s === "done", (el) => el.bg(t.done))
      .when(s !== "blocked" && s !== "done", (el) => el.border(1.5).border_color(t.idle ?? t.dim));
  },

  orchestrating(t, n) {
    const bar = (period) => div().w(2).h(4).rounded(1).bg(t.accent).loop("height", { from: 3, to: 10, period });
    return h_flex().flex_none().gap(5).items_center().text_size(11).text_color(t.accent)
      .child(h_flex().gap(1.5).items_end().h(10).child(bar(700)).child(bar(950)).child(bar(1200)))
      .child(div().child(`orchestrating · ${n} working`));
  },

  section(t, title, right = null) {
    return h_flex().h(32).px(6).mt(6).mb(2).gap(8).items_center()
      .child(div().flex_1().text_size(11).font_semibold().text_color(t.muted).child(title))
      .when(Boolean(right), (el) => el.child(right));
  },

  // --- model ------------------------------------------------------------------------------------
  build(t) {
    const terms = terminals().filter((x) => x.state === "live");
    const status = new Map(agents().map((a) => [a.address, a.status]));
    const agentList = agents();
    const statusOf = (x) => status.get(x.address) ?? (typeof x.status === "string" ? x.status : x.status?.state) ?? null;
    const cwdOf = (x) => x.foreground?.cwd ?? x.cwd ?? "";
    const rec = new Map(this.workers.map((w) => [w.name, w]));

    // project spaces (space folder = repo root) and the project list (registry ∪ project spaces)
    this.projectSpaces = new Map();
    for (const sp of spaces()) {
      if (sp.machine) continue;
      const root = this.rootOf(sp.folder, this.cx);
      if (root && !this.projectSpaces.has(root)) this.projectSpaces.set(root, sp);
    }
    const repos = [...new Set([...this.registry, ...this.projectSpaces.keys()])];

    const used = new Set();
    const projects = repos.map((repo) => {
      const name = base(repo);
      const orch = terms.find((x) => x.name === orchestratorName(repo));
      if (orch) used.add(orch.address);
      // its workers: registered ones, plus anything the orchestrator started itself (analysts, helpers…)
      const workers = terms.filter((x) => (/^w-/.test(x.name ?? "") && (x.labels?.repo === name || rec.get(x.name)?.repo_path === repo))
        || (orch && x.parent === orch.address));
      const kids = [];
      let active = 0;
      for (const w of workers) {
        used.add(w.address);
        const reviewers = terms.filter((k) => k.parent === w.address);
        reviewers.forEach((r) => used.add(r.address));
        const ws = statusOf(w);
        if (ws === "working") active++;
        active += reviewers.filter((r) => statusOf(r) === "working").length;
        kids.push({ kind: "worker", t: w, s: ws, w: rec.get(w.name), reviewers: reviewers.map((r) => ({ kind: "reviewer", t: r, s: statusOf(r) })) });
      }
      const chats = agentList.filter((a) => !used.has(a.address)).map((a) => terms.find((x) => x.address === a.address))
        .filter((x) => x && !/^(orchestrator|w|r)-/.test(x.name ?? "") && inside(cwdOf(x), repo));
      chats.forEach((c) => used.add(c.address));
      const os = orch ? statusOf(orch) : null;
      const group = base(repo.slice(0, repo.length - name.length - 1));
      return { repo, name, group, orch, os, active, kids, chats: chats.map((c) => ({ kind: "chat", t: c, s: statusOf(c) })) };
    });
    const looseChats = agentList.filter((a) => !used.has(a.address)).map((a) => ({ a, t: terms.find((x) => x.address === a.address) ?? { address: a.address } }))
      .filter(({ t: x }) => !/^(orchestrator|w|r)-/.test(x.name ?? ""));
    const busySpaces = new Set([...projects.flatMap((p) => [p.orch?.labels?.["herdr.space"], ...p.kids.map((k) => k.t.labels?.["herdr.space"])]),
      ...agentList.map((a) => a.space), ...this.projectSpaces.values()].map((x) => (typeof x === "object" ? x?.id : x)).filter(Boolean));
    const otherSpaces = spaces().filter((sp) => !busySpaces.has(sp.id) && !sp.machine);
    return { projects, looseChats, otherSpaces, statusOf };
  },

  inboxItems(model) {
    // Only orchestrators call you: one card per project whose orchestrator replied or is waiting on you.
    const items = [];
    for (const a of agents()) {
      const x = terminals().find((k) => k.address === a.address) ?? {};
      if (!/^orchestrator-/.test(x.name ?? "") || (a.status !== "done" && a.status !== "blocked")) continue;
      const p = model.projects.find((q) => q.orch?.address === a.address);
      const since = this.stateSince(a.address, a.status, x.status_ms);
      const waiting = this.workers.filter((w) => p && w.repo_path === p.repo && (w.phase === "blocked" || w.phase === "ready"))
        .map((w) => `#${w.issue} ${w.phase === "ready" ? "ready" : "asks"}`).join(" · ");
      items.push({ key: `${a.status}:${a.address}`, kind: a.status === "blocked" ? "permission" : "replied",
        project: p?.name ?? x.labels?.repo ?? a.space_name ?? "project", detail: waiting,
        at: since, version: since, target: a.address, pane: true });
    }
    const st = this.settled();
    return items.filter((it) => !(st[it.key] && (st[it.key].at ?? 0) >= (it.version ?? 0))).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  },

  // --- views ------------------------------------------------------------------------------------
  card(t, it, first = false) {
    const [glyph, color, what] = it.kind === "permission" ? ["!", t.blocked, "asks for permission"] : ["»", t.accent, "replied"];
    const open = `Open ${it.project}'s orchestrator`;
    return h_flex().id(`card-${it.key}`).tooltip(first ? this.key.tip(open, "orchestrator.needs-you") : open).mb(4).gap(9).p(9).rounded(9).bg(t.background).border(1).border_color(t.border).items_start()
      .cursor_pointer().hover((s) => s.border_color(color))
      .on_click(() => this.openAgent(it.target, true))
      .child(div().flex_none().mt(1).size(18).rounded(5).bg(color + "26").text_color(color).text_size(11).font_bold()
        .flex().items_center().justify_center().child(glyph))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().gap(6).items_center()
          .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(it.project))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(ago(it.at))))
        .child(div().text_size(11.5).text_color(color).child(`Orchestrator ${what}`))
        .when(Boolean(it.detail), (el) => el.child(div().truncate().text_size(11.5).text_color(t.dim).child(it.detail))))
      .child(div().id(`ok-${it.key}`).flex_none().px(4).rounded(4).text_size(11).text_color(t.dim)
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Done: hide it (it comes back when the orchestrator answers again)")
        .on_click((_e, cx) => { cx.stop_propagation(); this.settle(it.key, it.version); cx.notify(); }).child("✓"));
  },

  // Tree connectors, one slot per level: "│" a line passing by, "├" an elbow with the line going on, "└" the
  // last elbow, " " nothing. Each slot is as tall as its row (rows sit with no gap), so the lines of
  // consecutive rows join into one: a non-last item's line runs through every row under it (its activity
  // line, reviewers, terminals) down to its next sibling. The elbow meets the row's middle, where its text
  // is. The first slot's line sits under the project's chevron; deeper slots' lines sit under the parent
  // row's status mark (TREE_INDENT + the row gap + half a mark).
  lines(t, tree) {
    return h_flex().flex_none().h_full().children([...tree].map((l, i) => {
      const elbow = l === "├" || l === "└";
      return v_flex().flex_none().h_full().w(i === 0 ? TREE_SLOT : TREE_SLOT + TREE_INDENT).when(i > 0, (el) => el.pl(TREE_INDENT))
        .child(div().w_full().h(TREE_MID)
          .when(l !== " ", (el) => el.border_l(TREE_LINE).border_color(t.border))
          .when(elbow, (el) => el.border_b(TREE_LINE).border_color(t.border).when(l === "└", (e) => e.rounded_bl(6))))
        .child(div().w_full().flex_1().when(l === "│" || l === "├", (el) => el.border_l(TREE_LINE).border_color(t.border)));
    }));
  },

  row(t, id, { tree = "", mark = null, label, labelColor, tag = null, time = "", onClick, tip = null, bold = false }) {
    return h_flex().id(id).h(ROW_H).pl(12).pr(6).gap(6).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover))
      .when(Boolean(tip), (el) => el.tooltip(tip)).on_click(onClick)
      .when(Boolean(tree), (el) => el.child(this.lines(t, tree)))
      .when(Boolean(mark), (el) => el.child(mark))
      .child(div().flex_1().min_w(0).truncate().text_color(labelColor ?? t.foreground).when(bold, (el) => el.font_semibold()).child(label))
      .when(Boolean(tag), (el) => el.child(tag))
      .child(div().flex_none().w(26).text_size(11).text_color(t.dim).child(time));
  },

  project(t, p, model, current) {
    const open = this.expanded[p.repo] ?? (p.kids.length > 0);
    const toggle = (_e, cx) => {
      this.expanded = { ...this.expanded, [p.repo]: !open };
      try { localStorage.setItem("orchestrator.expanded", JSON.stringify(this.expanded)); } catch (_e) {}
      cx.notify();
    };
    const state = p.orch && p.os !== "working" && p.active > 0 ? this.orchestrating(t, p.active)
      : h_flex().flex_none().gap(5).items_center().text_size(11)
        .text_color(!p.orch ? t.dim : p.os === "working" ? t.working : p.os === "blocked" ? t.blocked : p.os === "done" ? t.accent : t.dim)
        .when(!(p.orch && (p.os === "idle" || !p.os)), (el) => el.child(div().child(!p.orch ? "no orchestrator" : p.os === "working" ? "thinking" : p.os === "blocked" ? "needs you" : "replied")))
        .child(div().child(p.orch ? ago(this.stateSince(p.orch.address, p.os, p.orch.status_ms)) : ""));
    const lines = [];
    const all = [...p.kids, ...p.chats];
    const nav = [this.key("agent.next"), this.key("agent.prev")].filter(Boolean).join(" / ");
    all.forEach((k, i) => {
      const last = i === all.length - 1;
      const since = this.stateSince(k.t.address, k.s, k.t.status_ms);
      if (k.kind === "worker") {
        lines.push(this.row(t, `w-${k.t.address}`, {
          tree: last ? "└" : "├", mark: this.mark(t, k.s),
          label: k.w ? `#${k.w.issue} ${k.w.title ?? ""}` : (k.t.title || k.t.name || "agent"), labelColor: t.foreground,
          tag: k.w ? phasePill(t, k.w.phase) : null, time: ago(since),
          tip: [k.w ? `${k.w.branch ?? ""} · opened ${ago(k.w.created)} ago${k.w.note ? ` · ${k.w.note}` : ""}` : null,
            "click to watch (talk to its orchestrator)", nav ? `next/prev agent ${nav}` : null].filter(Boolean).join(" · "),
          onClick: () => this.openAgent(k.t.address, false), // peek: watch it, talk to the orchestrator
        }));
        const doing = k.s === "working" ? ((k.t.report?.msg ?? k.t.status?.msg) ?? "") : "";
        // what it is doing, under its title: the sibling line passes by, and so does the line down to its
        // reviewers / terminals, if it has any
        if (doing) lines.push(h_flex().h(18).pl(12).pr(6).items_center().text_size(11).text_color(t.dim)
          .child(this.lines(t, `${last ? " " : "│"}${k.reviewers.length ? "│" : " "}`))
          .child(div().flex_1().min_w(0).ml(6 + 10 + 6 - TREE_SLOT - TREE_INDENT).truncate().italic().child(doing)));
        k.reviewers.forEach((r, j) => lines.push(this.row(t, `r-${r.t.address}`, {
          tree: `${last ? " " : "│"}${j === k.reviewers.length - 1 ? "└" : "├"}`, mark: this.mark(t, r.s),
          label: /^r-/.test(r.t.name ?? "") || /^reviewer-/.test(r.t.template ?? "")
            ? `reviewer · ${(r.t.template ?? (r.t.report?.app ?? r.t.status?.app) ?? "agent").replace(/^reviewer-/, "").replace(/-code$/, "")}`
            : `${(r.t.name ?? "").replace(/^w-[^]*?-\d+-/, "") || "terminal"} · ${(r.t.argv ?? []).slice(-3).join(" ")}`,
          labelColor: t.muted, tip: (r.t.argv ?? []).join(" ") || null,
          time: ago(this.stateSince(r.t.address, r.s, r.t.status_ms)),
          onClick: () => this.openAgent(r.t.address, false),
        })));
      } else {
        lines.push(this.row(t, `c-${k.t.address}`, {
          tree: last ? "└" : "├", mark: this.mark(t, k.s),
          label: `your chat · ${k.t.title || (k.t.report?.msg ?? k.t.status?.msg) || "claude"}`, labelColor: t.muted, time: ago(since),
          onClick: () => this.openAgent(k.t.address, true),
        }));
      }
    });
    return v_flex().gap(0)
      .child(h_flex().id(`p-${p.repo}`).h(30).pl(2).pr(6).gap(4).items_center().rounded(7).hover((s) => s.bg(t.hover))
        .child(div().id(`pt-${p.repo}`).flex_none().w(18).h(24).flex().items_center().justify_center()
          .when(all.length > 0, (el) => el.on_click(toggle).tooltip(open ? "Hide workers and chats" : `Show workers and chats (${all.length})`)
            .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(10).text_color(t.dim))))
        .child(h_flex().id(`po-${p.repo}`).flex_1().min_w(0).h_full().gap(8).items_center().cursor_pointer()
          .tooltip(p.repo === current ? this.key.tip("Talk to this project's orchestrator", "orchestrator.project") : "Talk to this project's orchestrator")
          .on_click((_e, cx) => this.openOrchestrator(p.repo, cx))
          .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(p.name))
          .child(state)))
      .when(open && all.length > 0, (el) => el.children(lines));
  },

  draw(cx) {
    this.cx = cx;
    this.key = shortcuts();
    const t = theme();
    const model = this.build(t);
    const current = this.currentProject();
    const inbox = this.inboxItems(model);
    this.lastItems = inbox;
    const hidden = Object.keys(this.settled()).length;

    // groups: the folder that holds each repo, in the configured order, then alphabetical
    const order = this.ui.order ?? [];
    const rank = (g) => { const i = order.indexOf(g); return i >= 0 ? i : 1e3; };
    const groups = [...new Set(model.projects.map((p) => p.group))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    const groupName = (g) => this.ui.names?.[g] ?? g.charAt(0).toUpperCase() + g.slice(1);
    const sortP = (a, b) => (b.active + b.kids.length) - (a.active + a.kids.length) || a.name.localeCompare(b.name);
    const shownProjects = groups.flatMap((g) => model.projects.filter((p) => p.group === g).sort(sortP));
    // agent.next / agent.prev (Alt+Down / Alt+Up by default) follow this list, as they followed herdr's Agents list
    setAgentOrder([...shownProjects.flatMap((p) => [p.orch?.address, ...p.kids.flatMap((k) => [k.t.address, ...k.reviewers.map((r) => r.t.address)]),
      ...p.chats.map((c) => c.t.address)]), ...model.looseChats.map(({ a }) => a.address)].filter(Boolean));

    return v_flex().id("root").size_full().bg(t.chrome).px(8).pb(10).gap(2).text_size(12.5).overflow_y_scrollbar()
      .child(this.section(t, "NEEDS YOU", h_flex().gap(8).items_center()
        .when(inbox.length > 0, (el) => el.child(h_flex().h(18).min_w(18).px(5).rounded(9).items_center().justify_center()
          .text_size(10.5).font_semibold().bg(t.blocked + "33").text_color(t.blocked).child(String(inbox.length))))
        .child(h_flex().id("new").h(22).px(8).gap(4).items_center().rounded(6).border(1).border_color(t.input).bg(t.raised)
          .cursor_pointer().hover((s) => s.bg(t.hover)).tooltip(this.key.tip("Open a project or start a chat", "orchestrator.new"))
          .on_click(() => this.openNew())
          .child(div().text_size(12).text_color(t.foreground).child("+ New")))))
      .children(inbox.length ? inbox.map((it, i) => this.card(t, it, i === 0))
        : [div().px(6).py(2).text_size(12).text_color(t.dim).child("All clear. A chat that needs you shows up here.")])
      .when(hidden > 0, (el) => el.child(div().id("unhide").px(6).text_size(11).text_color(t.dim).cursor_pointer()
        .hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => { setShared("orchestrator.inbox", {}); cx.notify(); })
        .child(`Hidden (${hidden}) · show again`)))
      .child(this.section(t, "PROJECTS"))
      .children(model.projects.length ? groups.flatMap((g) => [
        div().px(8).pt(8).pb(1).text_size(10).font_semibold().text_color(t.dim).child(groupName(g).toUpperCase()),
        ...model.projects.filter((p) => p.group === g).sort(sortP).map((p) => this.project(t, p, model, current)),
      ]) : [div().px(6).py(2).text_size(12).text_color(t.dim).child("No projects yet. + New → Open a project: pick a repo folder and you get its orchestrator to talk to.")])
      .child(this.section(t, "CHATS", div().text_size(11).text_color(t.dim).child("not in a project")))
      .children(model.looseChats.length ? model.looseChats.map(({ a, t: x }) => this.row(t, `lc-${a.address}`, {
        mark: this.mark(t, a.status), label: `${a.space_name}${a.title ? ` · ${a.title}` : ""}`,
        time: ago(this.stateSince(a.address, a.status, x.status_ms)), onClick: () => this.openAgent(a.address, true),
      })) : [div().px(6).py(2).text_size(12).text_color(t.dim).child("+ New → New chat to talk to an agent outside any project.")])
      .when(model.otherSpaces.length > 0, (el) => el
        .child(h_flex().id("other").h(24).px(6).pt(6).gap(6).items_center().cursor_pointer().text_size(11).text_color(t.dim)
          .hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => { this.otherOpen = !this.otherOpen; cx.notify(); })
          .child(svg(`mods/workspace-chrome/chevron-${this.otherOpen ? "down" : "right"}.svg`).size(10))
          .child(div().child(`Other spaces (${model.otherSpaces.length})`)))
        .when(this.otherOpen, (el) => el.children(model.otherSpaces.map((sp) => this.row(t, `os-${sp.id}`, {
          label: sp.name, labelColor: t.muted, onClick: () => run("space.select", { id: sp.id }),
        })))));
  },
};
