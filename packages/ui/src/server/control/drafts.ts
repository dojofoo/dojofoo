import { scaffoldAuthoringWorkspace } from "@dojofoo/agents/scaffold";
import { writeDojoRc } from "@dojofoo/config";
import { observeWorkspacePath, type LocalStateOptions, type LocalWorkspace, type WorkspaceKind } from "@dojofoo/config/local-state";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

function draftsDirectory(options: LocalStateOptions): string {
  return resolve(options.stateHome ?? process.env.DOJOFOO_HOME ?? resolve(homedir(), ".dojofoo"), "drafts");
}

/** Recognition only: never converts an existing project into a managed draft. */
export function isManagedDraft(root: string, options: LocalStateOptions): boolean {
  try { return dirname(realpathSync(root)) === realpathSync(draftsDirectory(options)); }
  catch { return false; }
}

/** The newest Kyoshi session in the course's agent-api session list. */
export function newestKyoshiSession(root: string): { id: string } | undefined {
  const path = resolve(root, ".dojo", "agent-sessions.json");
  if (!existsSync(path)) return undefined;
  const { sessions } = JSON.parse(readFileSync(path, "utf8")) as { sessions?: { id: string; persona: string; createdAt: string }[] };
  return (sessions ?? []).filter(session => session.persona === "kyoshi")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

/** The dashboard's draft rule: a managed draft, a legacy ACP pointer, or a folder with a Kyoshi session. */
export function isAuthoringWorkspace(root: string, options: LocalStateOptions): boolean {
  return isManagedDraft(root, options) || existsSync(resolve(root, ".dojo", "kyoshi.json")) || newestKyoshiSession(root) !== undefined;
}

/** A row registered before kinds existed falls back to the draft rule until the startup backfill. */
export function workspaceKind(workspace: LocalWorkspace, options: LocalStateOptions): WorkspaceKind {
  return workspace.kind ?? (isAuthoringWorkspace(workspace.path, options) ? "draft" : "learner");
}

/** A new directory and the existing scaffold/registry; no agent or package setup is started. */
export function createDraft(name: string, options: LocalStateOptions) {
  const directory = draftsDirectory(options);
  mkdirSync(directory, { recursive: true });
  const root = mkdtempSync(join(directory, "course-"));
  try {
    scaffoldAuthoringWorkspace({ root, name, style: "katas",
      moduleUrl: process.env.DOJO_CLI ? pathToFileURL(realpathSync(process.env.DOJO_CLI)).href : undefined });
    writeDojoRc(root, { currentDojo: "", currentKata: null, editor: null });
    const workspaceId = observeWorkspacePath(root, { ...options, kind: "draft" });
    return { workspaceId, path: root, name, description: "", mode: "katas", sessionId: null, lastSeenAt: options.now ?? Date.now() };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

export async function closeDraftRuntime(root: string): Promise<void> {
  const load = createRequire(import.meta.url);
  const { closeKyoshiRuntime } = load("@dojofoo/agents/eve/runtime") as typeof import("@dojofoo/agents/eve/runtime");
  await closeKyoshiRuntime(root);
}
