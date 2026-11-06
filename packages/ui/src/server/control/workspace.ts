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
