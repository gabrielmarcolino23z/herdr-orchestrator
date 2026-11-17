// "close" view: the "Close project" dialog, the one way to close a project on purpose.
// Opened from the space menu (orc-menu) and the anchor. Props: { view: "close", space?, folder? }.
// Confirms and runs `ensure-projects --close <folder>`: unregisters it and closes the space.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, home, props, closeOverlay, theme, notify, checking } from "herdr";
import { base, ensure } from "./lib.js";

export const close = {
  start(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.closing = false;
  },

  target() {
    const p = props() ?? {};
    const space = spaces().find((s) => s.id === p.space);
    const folder = p.folder ?? space?.folder ?? "";
    return { name: space?.name ?? base(folder), folder };
  },

  confirm(cx) {
    if (this.closing || checking()) return;
    this.closing = true;
    cx.notify();
    cx.spawn(async (cx) => {
      const r = await ensure(["--close", this.target().folder]);
      closeOverlay(props()?.overlay);
      notify(r.code === 0
        ? { title: "Project closed", body: "The orchestrator's conversation, workers and worktrees are kept.", level: "info" }
        : { title: "Could not close the project", body: (r.stderr || r.stdout).slice(0, 160), level: "error" });
      cx.notify();
    });
  },

  draw(_cx) {
    const t = theme();
    const { name, folder } = this.target();
    const btn = (id, label, bg, fg, onClick) => h_flex().id(id).h(32).px(14).items_center().rounded(8).border_1()
      .border_color(id === "no" ? t.input : bg).bg(bg).text_color(fg).cursor_pointer().hover((s) => s.opacity(0.88)).on_click(onClick).child(label);
    return v_flex().id("close").track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        closeOverlay(props().overlay);
        cx.stop_propagation();
      })
      .size_full().p(18).gap(12).rounded(8).bg(t.popover).text_size(13)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child(`Close project ${name}?`))
      .child(div().text_color(t.muted).child("Closes the space, its project tab and the orchestrator. The orchestrator's conversation, workers and worktrees are kept. To come back, open a space in the repo's folder."))
      .child(div().text_color(t.dim).text_size(12).child(folder.replace(home(), "~")))
      .child(h_flex().gap(8).justify_end()
        .child(btn("no", "Cancel", t.popover, t.foreground, () => closeOverlay(props().overlay)))
        .child(btn("yes", this.closing ? "Closing…" : "Close project", t.blocked, t.background, (_e, cx) => this.confirm(cx))));
  },
};
