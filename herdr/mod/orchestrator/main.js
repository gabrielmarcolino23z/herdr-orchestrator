// orchestrator mod (herdr-orchestrator): the herdr-app UI for projects, orchestrators and workers.
// Source: the herdr-orchestrator repo, herdr/mod/orchestrator (installed by `install`; don't edit the copy
// in ~/.config/herdr-app/mods/orchestrator). One view per props.view:
//   "sidebar" (default) the sidebar: Needs you, Projects (orchestrators, workers, reviewers, your chats), Chats;
//   "new"     the "+ New" dialog: open a project (a repo folder) or start a chat;
//   "project" the anchor of a project space (the "project" tab): orchestrator, workers, backlog;
//   "close"   the "Close project" dialog.
// Design: docs/design/sidebar.md.
import { View } from "gpui-kit";
import { props } from "herdr";
import { sidebar } from "./sidebar.js";
import { newDialog } from "./new.js";
import { project } from "./project.js";
import { close } from "./close.js";

const VIEWS = { sidebar, new: newDialog, project, close };

export default class Orchestrator extends View {
  init(_props, cx) {
    Object.assign(this, VIEWS[props()?.view] ?? sidebar);
    this.start(cx);
  }

  render(cx) {
    return this.draw(cx);
  }
}
