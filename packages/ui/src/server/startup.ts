import { dirname, join } from "node:path";
import { listWorkspaces, localStateDirectory, setWorkspaceKind, type LocalStateOptions } from "@dojofoo/config/local-state";
import { reapAllProcessGroups } from "@dojofoo/agent/process-groups";
import type { GuardViolation } from "@dojofoo/protocol";
import { isAuthoringWorkspace } from "./control/drafts";
import { reportViolation } from "./agent-session/guard";
import { verifyAllWindows } from "./agent-session/guard-store";
import { acquireServerLock, serverUrl } from "./server-lock";

/** Gives each workspace registered before kinds existed the kind the dashboard's draft rule finds. */
export function backfillWorkspaceKinds(options: LocalStateOptions = {}): void {
  for (const workspace of listWorkspaces(options)) {
    if (workspace.kind !== null) continue;
    setWorkspaceKind(workspace.id, isAuthoringWorkspace(workspace.path, options) ? "draft" : "learner", options);
  }
}

const startedKey = Symbol.for("dojofoo.ui-startup");
type Started = { done?: Promise<void> };
const started = ((globalThis as Record<symbol, unknown>)[startedKey] ??= {}) as Started;

/** Resolves once startup has verified every persisted guard window; hosts wait for it before they start (startup step 3). */
export function startupVerified(): Promise<void> {
  return started.done ?? Promise.resolve();
}

/** Runs once when the UI server starts, in the design's order: the server lock (a refusal exits), the kind backfill (its errors are
 *  logged), the native process groups a crashed host left behind, then every persisted guard window, before any host starts. */
export function startUiServer(options: LocalStateOptions & { url?: string; waitMs?: number; exit?: (code: number) => unknown } = {}): Promise<void> {
  const state = localStateDirectory(options);
  acquireServerLock({ stateHome: dirname(state), url: options.url ?? serverUrl(), ...(options.waitMs !== undefined ? { waitMs: options.waitMs } : {}),
    ...(options.exit ? { exit: options.exit } : {}) });
  // A failed backfill must not stop the UI; rows without a kind still use the draft rule
  try { backfillWorkspaceKinds(options); }
  catch (error) { console.error(error); }
  reapAllProcessGroups(join(state, "processes"));
  started.done = verifyAllWindows(state).then(async verdicts => {
    for (const { window, action, quarantined } of verdicts) {
      const { root, workspaceId, courseId, lessonId } = window.meta;
      if (action === "unchanged" || !root || !workspaceId || !courseId || !lessonId) continue;
      const violation: GuardViolation = { sessionId: window.owner, courseId, lessonId,
        paths: [window.path.startsWith(`${root}/`) ? window.path.slice(root.length + 1) : window.path], action,
        ...(quarantined ? { quarantined } : {}), at: new Date().toISOString() };
      await reportViolation(root, workspaceId, violation).catch(error => console.warn(error));
    }
  }, error => { console.error(`Could not verify the guard windows: ${error instanceof Error ? error.message : String(error)}`); });
  return started.done;
}
