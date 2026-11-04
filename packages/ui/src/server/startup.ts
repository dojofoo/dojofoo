import { listWorkspaces, setWorkspaceKind, type LocalStateOptions } from "@dojofoo/config/local-state";
import { isAuthoringWorkspace } from "./control/drafts";

/** Gives each workspace registered before kinds existed the kind the dashboard's draft rule finds. */
export function backfillWorkspaceKinds(options: LocalStateOptions = {}): void {
  for (const workspace of listWorkspaces(options)) {
    if (workspace.kind !== null) continue;
    setWorkspaceKind(workspace.id, isAuthoringWorkspace(workspace.path, options) ? "draft" : "learner", options);
  }
}

/** Runs once when the UI server starts. Steps 4 and 5 add reaping, recovery and the server lock here. */
export function startUiServer(options: LocalStateOptions = {}): void {
  backfillWorkspaceKinds(options);
}
