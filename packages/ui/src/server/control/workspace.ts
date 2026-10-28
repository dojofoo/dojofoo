import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findManifestPath, findProjectRoot, hasWorkspaceConfiguration } from "@dojofoo/config";
import { listWorkspaces, type LocalStateOptions } from "@dojofoo/config/local-state";

/** @deprecated New resource routes identify the workspace in their URL. */
export const WORKSPACE_HEADER = "x-dojofoo-workspace";

/** @deprecated Kept temporarily for the legacy project and interactive APIs. */
export function resolveRequestWorkspace(request: Request, options: LocalStateOptions = {}): string {
  const workspaceId = request.headers.get(WORKSPACE_HEADER) ?? new URL(request.url).searchParams.get("workspace");
  if (!workspaceId) return resolve(process.env.DOJO_PROJECT_ROOT ?? findProjectRoot());
  return resolveWorkspaceId(workspaceId, options);
}

export function resolveWorkspaceId(workspaceId: string, options: LocalStateOptions = {}): string {
  const workspace = listWorkspaces(options).find((candidate) => candidate.id === workspaceId);
  if (!workspace || (!hasWorkspaceConfiguration(workspace.path) && !findManifestPath(workspace.path))) {
    throw new Error("The selected dojo workspace is no longer available.");
  }
  return resolve(workspace.path);
}

export function resolveSessionWorkspace(sessionId: string, options: LocalStateOptions = {}): string {
  for (const workspace of listWorkspaces(options)) {
    try {
      const state = JSON.parse(readFileSync(resolve(workspace.path, ".dojo", "web.json"), "utf8")) as {
        threads?: Record<string, string | { sessionId?: string; aliases?: string[] }>;
      };
      const found = Object.values(state.threads ?? {}).some((thread) => threadOwnsSession(thread, sessionId));
      if (found) return resolveWorkspaceId(workspace.id, options);
    } catch {
      // A workspace without web session state cannot own this session.
    }
  }
  throw new Error("The lesson session is no longer available");
}

export function threadOwnsSession(
  thread: string | { sessionId?: string; aliases?: string[] },
  sessionId: string,
): boolean {
  return typeof thread === "string"
    ? thread === sessionId
    : thread.sessionId === sessionId;
}
