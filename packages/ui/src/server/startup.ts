import { join } from "node:path";
import { listWorkspaces, localStateDirectory, setWorkspaceKind, type LocalStateOptions } from "@dojofoo/config/local-state";
import { reapAllProcessGroups } from "@dojofoo/agent/process-groups";
import { isAuthoringWorkspace } from "./control/drafts";

/** Gives each workspace registered before kinds existed the kind the dashboard's draft rule finds. */
export function backfillWorkspaceKinds(options: LocalStateOptions = {}): void {
  for (const workspace of listWorkspaces(options)) {
    if (workspace.kind !== null) continue;
    setWorkspaceKind(workspace.id, isAuthoringWorkspace(workspace.path, options) ? "draft" : "learner", options);
  }
}

/** Runs once when the UI server starts: the kind backfill, then the native process groups a crashed host left behind.
 *  Each host reconciles its sessions when it becomes ready; step 5 adds the server lock here. */
export function startUiServer(options: LocalStateOptions = {}): void {
  backfillWorkspaceKinds(options);
  reapAllProcessGroups(join(localStateDirectory(options), "processes"));
}
