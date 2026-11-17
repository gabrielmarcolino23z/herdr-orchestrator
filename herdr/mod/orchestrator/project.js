// "project" view: the anchor of a project space (the "project" tab, always first, created by
// ensure-projects). Being a mod and not a terminal, closing Claude, the orchestrator or any terminal
// never closes the space. Shows the orchestrator (with reopen), the repo's workers and "Close project…".
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, theme, exec, hc, run, home, props, notify, checking, openOverlay } from "herdr";
import { base, button, ensure, link, readWorkers, orchestratorName, phasePill, live } from "./lib.js";

export const project = {
  start(cx) {
    this.repo = props()?.repo ?? "";
    this.name = orchestratorName(this.repo);
    this.orchestrator = undefined; // undefined: looking; null: stopped; object: live
    this.opening = false;
    this.workers = [];
    this.issues = null; // open GitHub issues (the backlog)
    this.issuesError = null;
    this.reload(cx);
    this.loadIssues(cx);
    cx.timer.every(5000, (cx) => this.reload(cx));
    cx.timer.every(300000, (cx) => this.loadIssues(cx));
  },

  loadIssues(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("gh", ["issue", "list", "--state", "open", "--limit", "50", "--json", "number,title,url,labels"], { cwd: this.repo, timeout: 30000 });
        if (r.code !== 0) throw new Error(r.stderr.trim() || "gh failed");
        this.issues = JSON.parse(r.stdout);
        this.issuesError = null;
      } catch (e) {
        this.issues = [];
        this.issuesError = String(e?.message ?? e).slice(0, 140);
      }
      cx.notify();
    });
  },

  askForWorker(n, cx) {
    cx.spawn(async (cx) => {
      const g = await ensure(["--create", this.repo]);
      if (g.code !== 0) { notify({ title: `Could not open ${this.name}`, body: (g.stderr || g.stdout).slice(0, 160), level: "error" }); return; }
      await hc(["wait", this.name, "--timeout", "60"]);
      const r = await hc(["send", this.name, `Open a worker for issue #${n}.`]);
      notify(r.code === 0 ? { title: `Asked ${this.name}`, body: `Open a worker for #${n}`, level: "info" }
        : { title: `Could not reach ${this.name}`, body: (r.stderr || "").slice(0, 160), level: "error" });
      cx.notify();
    });
  },

  // Closes as "not planned" (doesn't delete: deleting is irreversible and breaks links).
  closeIssue(n, cx) {
    this.confirming = null;
    cx.spawn(async (cx) => {
      const r = await exec("gh", ["issue", "close", String(n), "--reason", "not planned"], { cwd: this.repo, timeout: 30000 });
      if (r.code === 0) {
        this.issues = (this.issues ?? []).filter((i) => i.number !== n);
        notify({ title: `#${n} closed`, body: "As not planned. You can reopen it on GitHub.", level: "info" });
      } else notify({ title: `Could not close #${n}`, body: (r.stderr || "gh failed").slice(0, 160), level: "error" });
      cx.notify();
    });
  },

  issueRow(t, i) {
    if (this.confirming === i.number) {
      return h_flex().gap(8).items_center().px(6).py(2).rounded(6).bg(t.raised)
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(`Close #${i.number} as not planned?`))
        .child(button(t, `cy-${i.number}`, "yes", (_e, cx) => this.closeIssue(i.number, cx)))
        .child(button(t, `cn-${i.number}`, "no", (_e, cx) => { this.confirming = null; cx.notify(); }));
    }
    return h_flex().gap(8).items_center()
      .child(link(t, `oi-${i.number}`, `#${i.number}`, i.url))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(i.title))
      .child(button(t, `ow-${i.number}`, "▶ worker", (_e, cx) => this.askForWorker(i.number, cx)))
      .child(button(t, `ox-${i.number}`, "✕", (_e, cx) => { this.confirming = i.number; cx.notify(); }));
  },

  reload(cx) {
    cx.spawn(async (cx) => {
      this.orchestrator = await live(this.name);
      this.workers = await readWorkers(this.repo);
      cx.notify();
    });
  },

  openOrchestrator(cx) {
    if (checking() || this.opening) return;
    this.opening = true;
    cx.notify();
    cx.spawn(async (cx) => {
      const r = await ensure(["--repo", this.repo]);
      this.opening = false;
      if (r.code !== 0) notify({ title: `Could not open ${this.name}`, body: (r.stderr || r.stdout).slice(0, 160), level: "error" });
      this.reload(cx);
    });
  },

  draw(_cx) {
    const t = theme();
    const f = this.orchestrator;
    const status = f ? (agents().find((a) => a.address === f.address)?.status ?? (typeof f.status === "string" ? f.status : f.status?.state) ?? "idle") : null;
    const card = (title, ...children) => v_flex().gap(8).p(14).rounded(10).border(1).border_color(t.border).bg(t.background)
      .child(div().text_color(t.muted).font_semibold().child(title)).children(children);

    const orchestrator = h_flex().gap(10).items_center()
      .child(div().size(9).rounded(5).flex_none().bg(f ? (t[status] ?? t.idle) : t.dim))
      .child(v_flex().flex_1().min_w(0)
        .child(div().text_color(t.foreground).font_semibold().child(this.name))
        .child(div().text_color(t.dim).text_size(12).child(
          f === undefined ? "looking…" : f ? `live · ${status}` : "stopped: its conversation is kept")))
      .child(f
        ? button(t, "go-orchestrator", "go to orchestrator", () => run("pane.focus", { terminal: f.address }), true)
        : button(t, "open-orchestrator", this.opening ? "opening…" : "▶ open orchestrator", (_e, cx) => this.openOrchestrator(cx), true));

    const workers = this.workers.length
      ? this.workers.map((w) => h_flex().gap(8).items_center()
        .child(div().text_color(t.accent).font_semibold().flex_none().child(`#${w.issue}`))
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(w.title ?? ""))
        .child(phasePill(t, w.phase))
        .child(button(t, `w-${w.issue}`, "go", () => run("space.select", { id: w.space }))))
      : [div().text_color(t.dim).child("No workers. Ask the orchestrator or use ▶ worker on an issue below.")];

    return v_flex().id("root").size_full().bg(t.surface).p(24).gap(16).text_size(13).overflow_y_scrollbar()
      .child(v_flex().gap(2)
        .child(div().text_size(20).font_semibold().text_color(t.foreground).child(base(this.repo)))
        .child(div().text_color(t.dim).child(this.repo.replace(home(), "~"))))
      .child(card("Orchestrator", orchestrator))
      .child(card(`Workers (${this.workers.length})`, ...workers))
      .child(card(`Backlog · open issues (${(this.issues ?? []).filter((i) => !this.workers.some((w) => w.issue === i.number)).length})`,
        ...(this.issues === null ? [div().text_color(t.dim).child("loading…")]
          : this.issuesError ? [div().text_color(t.blocked).child(this.issuesError)]
          : this.issues.filter((i) => !this.workers.some((w) => w.issue === i.number)).map((i) => this.issueRow(t, i)))))
      .child(h_flex().gap(14).items_start()
        .child(div().flex_1().min_w(0).text_color(t.dim).text_size(12).child(
          "This tab holds the space: closing Claude, the orchestrator or a terminal doesn't close the project, and a project closed by accident comes back by itself."))
        .child(button(t, "close-project", "Close project…",
          () => openOverlay({ mod: "orchestrator", kind: "dialog", width: 460, height: 230, props: { view: "close", folder: this.repo } }), true)));
  },
};
