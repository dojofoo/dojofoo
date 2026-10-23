import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { isGitIgnoredSync } from "globby";

const privateAuthoringDirectories = new Set([".dojo", ".git", "node_modules"]);

function privateAuthoringEntry(name: string): boolean {
  return privateAuthoringDirectories.has(name);
}

export function authoringFileFilter(root: string): (path: string) => boolean {
  const ignored = isGitIgnoredSync({ cwd: root, followSymbolicLinks: false });
  return path => {
    if (path.split("/").some(privateAuthoringEntry)) return false;
    const absolute = resolve(root, path);
    return !ignored(`${absolute}${lstatSync(absolute, { throwIfNoEntry: false })?.isDirectory() ? "/" : ""}`);
  };
}

export function readAuthoringFile(root: string, requestedPath: string): {
  content: string;
  path: string;
} {
  const path = authoringFilePath(root, requestedPath);
  return {
    path: requestedPath,
    content: existsSync(path) ? readFileSync(path, "utf8") : "",
  };
}

export function writeAuthoringFile(
  root: string,
  requestedPath: string,
  content: string
): void {
  const path = authoringFilePath(root, requestedPath);
  validateAuthoringContent(requestedPath, content);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content.endsWith("\n") ? content : `${content}\n`);
  recordAuthoringEdit(root, requestedPath);
}

export function pendingAuthoringEdits(root: string): string[] {
  const path = pendingEditsPath(root);
  if (!existsSync(path)) return [];
  const value = JSON.parse(readFileSync(path, "utf8")) as { paths?: unknown };
  return Array.isArray(value.paths)
    ? value.paths.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function acknowledgeAuthoringEdits(root: string, acknowledged: string[]): void {
  if (acknowledged.length === 0) return;
  const remaining = pendingAuthoringEdits(root).filter((path) => !acknowledged.includes(path));
  writePendingEdits(root, remaining);
}

function authoringFilePath(root: string, requestedPath: string): string {
  const segments = requestedPath.split("/");
  if (
    !requestedPath
    || isAbsolute(requestedPath)
    || requestedPath.includes("\\")
    || segments.some((segment) => !segment || segment === "." || segment === "..")
    || !authoringFileFilter(root)(requestedPath)
  ) {
    throw new Error(`Unsupported authoring file: ${requestedPath}`);
  }
  let ancestor = root;
  for (const segment of segments) {
    ancestor = resolve(ancestor, segment);
    // The editor never follows links into runtime state or an external folder.
    try {
      if (lstatSync(ancestor).isSymbolicLink()) throw new Error(`Unsupported authoring file: ${requestedPath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return resolve(root, requestedPath);
}

function validateAuthoringContent(path: string, content: string): void {
  if (path === "dojo.yaml") {
    const manifest = parseYaml(content);
    if (!isRecord(manifest)) throw new Error("dojo.yaml must contain a YAML object");
  }
  if (path.endsWith(".eval.yaml") || path.endsWith(".eval.yml")) {
    const definition = parseYaml(content);
    if (!isRecord(definition)) throw new Error("Lesson eval hook must contain a YAML object");
  }
  if (path.endsWith(".json")) JSON.parse(content);
}

function recordAuthoringEdit(root: string, path: string): void {
  writePendingEdits(root, [...new Set([...pendingAuthoringEdits(root), path])]);
}

function writePendingEdits(root: string, paths: string[]): void {
  const path = pendingEditsPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ paths }, null, 2)}\n`);
}

function pendingEditsPath(root: string): string {
  return resolve(root, ".dojo", "authoring-edits.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
