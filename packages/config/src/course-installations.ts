import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { dojoDir, listDojos, readCourseManifest, type CourseManifest } from "./index";
import { listWorkspaces, type LocalStateOptions } from "./local-state";

export function courseTitle(root: string, id: string, manifest = readCourseManifest(root, id)): string {
  if (manifest.title?.trim()) return manifest.title;
  if (manifest.mode === "interactive") {
    const definition = JSON.parse(readFileSync(resolve(dojoDir(root, id), manifest.lessons), "utf8")) as { title?: string };
    if (definition.title?.trim()) return definition.title;
    throw new Error(`Course ${id} has no authored title.`);
  }
  return manifest.name.replace(/^@[^/]+\//, "").replace(/[-_]+/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

export type CourseInstallation = { id: string; root: string; workspaceId: string; title: string; manifest: CourseManifest };

export function courseInstallations(id: string, options: LocalStateOptions = {}): CourseInstallation[] {
  return listWorkspaces(options).flatMap(workspace => {
    if (!listDojos(workspace.path).includes(id)) return [];
    const manifest = readCourseManifest(workspace.path, id);
    return [{ id, root: workspace.path, workspaceId: workspace.id, title: courseTitle(workspace.path, id, manifest), manifest }];
  });
}

export function findInstalledCourse(id: string, options: LocalStateOptions = {}): CourseInstallation {
  const installations = courseInstallations(id, options);
  if (installations.length === 0) throw new Error(`Course ${id} is not installed.`);
  if (installations.length > 1) throw new Error(`Course ${id} has multiple installations. Remove the extra installations before opening it.`);
  return installations[0];
}

export function assertCourseWorkspace(root: string, id: string, options: LocalStateOptions = {}): void {
  let canonical = resolve(root);
  try { canonical = realpathSync(canonical); } catch { /* The destination may not exist yet. */ }
  const existing = courseInstallations(id, options).find(course => realpathSync(course.root) !== canonical);
  if (existing) throw new Error(`Course ${id} is installed in ${existing.root}. Remove the existing installation first, then install it in ${canonical}.`);
}
