// "new" view: the "+ New" dialog.
// - Open a project: the system folder picker; any git repo, wherever you keep it. ensure-projects
//   --create registers it and opens its space with the "project" tab and its orchestrator. A folder
//   that isn't a git repo gets a choice: "Initialize git here" (git init -b main, then the project).
// - New chat: a Claude session, inside a project (a new tab in its space, so it shows under that
//   project) or on its own (a new space, so it shows under Chats).
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, terminals, theme, run, home, props, closeOverlay, notify, pickFolder, checking, readTextFile } from "herdr";
import { base, ensure, orchestratorName, statePath } from "./lib.js";

export const newDialog = {
  start(cx) {
    this.step = "choose";
    this.where = null; // repo path, or null = on its own
    this.folder = ""; // the picked folder, while asking to initialize git there
    this.projects = [];
    this.busy = false;
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.input = InputState.new({ placeholder: "What is it about? (optional)" });
    this.input.on("submit", (_e, cx) => this.startChat(cx));
    cx.spawn(async (cx) => {
      try { this.projects = JSON.parse((await readTextFile(statePath("projects.json"))) ?? "{}").repos ?? []; } catch (_e) {}
      cx.notify();
    });
  },

  close() {
    closeOverlay(props()?.overlay);
  },

  openProject(cx) {
    if (checking() || this.busy) return;
    cx.spawn(async (cx) => {
      const folder = await pickFolder({ prompt: "Pick a repo folder to open as a project" });
      if (!folder) return;
      await this.create(folder, false, cx);
    });
  },

  // ensure-projects --create; exit 3 = the folder isn't a git repo: offer to initialize one (--init).
  async create(folder, init, cx) {
    this.busy = true;
    cx.notify();
    let r;
    try {
      r = await ensure(["--create", folder, ...(init ? ["--init"] : [])]);
    } catch (e) {
      r = { code: 1, stderr: String(e?.message ?? e) };
    }
    this.busy = false;
    if (r.code === 3 && !init) {
      this.step = "init";
      this.folder = folder;
      cx.notify();
      return;
    }
    if (r.code !== 0) {
      notify({ title: `Couldn't open ${base(folder)}`, body: (r.stderr || r.stdout || "").trim().slice(0, 240), level: "error" });
      cx.notify();
      return;
    }
    this.close();
    const t = terminals().find((x) => x.state === "live" && x.name === orchestratorName(folder));
    if (t) run("pane.focus", { terminal: t.address });
    notify({ title: `${base(folder)} is a project`, body: "Talk to its orchestrator to get work done.", level: "info" });
  },

  startChat(cx) {
    const title = this.input.value().trim() || "chat";
    const argv = [`${home()}/.agents/skills/herdr-orchestrator/scripts/with-tools`, "claude"];
    this.close();
    if (this.where) {
      const sp = spaces().find((s) => s.folder === this.where);
      if (sp) run("tab.new", { space: sp.id, name: title, folder: this.where, argv, focus: true });
      else run("space.new", { name: base(this.where), folder: this.where, tab: title, argv, focus: true });
    } else {
      run("space.new", { name: title, folder: home(), tab: title, argv, focus: true });
    }
  },

  option(t, id, title, text, onClick) {
    return v_flex().id(id).flex_1().min_w(0).gap(6).p(14).rounded(10).border(1).border_color(t.input).cursor_pointer()
      .hover((s) => s.border_color(t.accent).bg(t.hover)).on_click(onClick)
      .child(div().font_semibold().text_color(t.foreground).child(title))
      .child(div().w_full().text_size(12).text_color(t.muted).child(text));
  },

  chip(t, id, label, on, onClick) {
    return div().id(id).flex_none().px(10).py(3).rounded(12).border(1).border_color(on ? t.accent : t.input).bg(on ? t.selected : t.popover)
      .text_size(12).text_color(t.foreground).cursor_pointer().on_click(onClick).child(label);
  },

  button(t, id, label, onClick, primary = false) {
    return div().id(id).px(14).py(6).rounded(8).cursor_pointer().on_click(onClick)
      .when(primary, (el) => el.bg(t.solid).text_color(t.solid_foreground).font_semibold())
      .when(!primary, (el) => el.bg(t.raised).text_color(t.foreground))
      .child(label);
  },

  draw(_cx) {
    const t = theme();
    const root = v_flex().id("new").track_focus(this.handle).size_full().p(18).gap(14).rounded(8).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => { if (e.key === "escape") { this.close(); cx.stop_propagation(); } });
    const header = (title) => h_flex().items_center()
      .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child(title))
      .child(div().text_size(11).text_color(t.dim).child("Esc"));
    if (this.step === "init") {
      return root.child(header("This folder isn't a git repo"))
        .child(div().text_size(12).text_color(t.muted).truncate().child(this.folder.replace(home(), "~")))
        .child(div().text_color(t.foreground).child("A project needs a git repo: its workers get worktrees and branches of it."))
        .child(div().text_size(12).text_color(t.dim).child("Initialize git here runs git init -b main in this folder (no commit, no remote), then opens it as a project."))
        .child(h_flex().gap(8).justify_end()
          .child(this.button(t, "init-back", "Back", (_e, cx) => { this.step = "choose"; cx.notify(); }))
          .child(this.button(t, "init-go", this.busy ? "Opening…" : "Initialize git here",
            (_e, cx) => { if (!this.busy) cx.spawn(async (cx) => this.create(this.folder, true, cx)); }, true)));
    }
    if (this.step === "chat") {
      return root.child(header("New chat"))
        .child(Input.new(this.input).h(34).px(10).rounded(8).border_1().border_color(t.input).bg(t.background).text_color(t.foreground))
        .child(div().text_size(12).text_color(t.muted).child("Where"))
        .child(h_flex().w_full().flex_wrap().gap(6)
          .children(this.projects.map((p) => this.chip(t, `w-${p}`, base(p), this.where === p, (_e, cx) => { this.where = p; cx.notify(); })))
          .child(this.chip(t, "w-none", "On its own", this.where === null, (_e, cx) => { this.where = null; cx.notify(); })))
        .child(div().text_size(12).text_color(t.dim).child("In a project, the chat runs in its folder and shows inside it. On its own, it shows under Chats."))
        .child(h_flex().gap(8).justify_end()
          .child(this.button(t, "back", "Back", (_e, cx) => { this.step = "choose"; cx.notify(); }))
          .child(this.button(t, "go", "Start chat", (_e, cx) => this.startChat(cx), true)));
    }
    return root.child(header("New"))
      .child(h_flex().gap(10)
        .child(this.option(t, "o-project", this.busy ? "Opening…" : "Open a project",
          "Pick a repo folder you already have. It gets an orchestrator to talk to.", (_e, cx) => this.openProject(cx)))
        .child(this.option(t, "o-chat", "New chat", "Talk to an agent, inside a project or on its own.",
          (_e, cx) => { this.step = "chat"; cx.notify(); this.input.focus(); })));
  },
};
