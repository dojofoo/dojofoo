import { scaffoldAuthoringWorkspace } from "@dojofoo/authoring/scaffold";
import { writeDojoRc } from "@dojofoo/config";
import { observeWorkspacePath, type LocalStateOptions } from "@dojofoo/config/local-state";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function draftsDirectory(options: LocalStateOptions): string {
  return resolve(options.stateHome ?? process.env.DOJOFOO_HOME ?? resolve(homedir(), ".dojofoo"), "drafts");
}

/** Recognition only: never converts an existing project into a managed draft. */
export function isManagedDraft(root: string, options: LocalStateOptions): boolean {
  try { return dirname(realpathSync(root)) === realpathSync(draftsDirectory(options)); }
  catch { return false; }
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
    const workspaceId = observeWorkspacePath(root, options);
    return { workspaceId, path: root, name, description: "", mode: "katas", sessionId: null, lastSeenAt: options.now ?? Date.now() };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
