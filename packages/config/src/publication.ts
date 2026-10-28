import { isGitIgnoredSync } from "globby";
import { lstatSync } from "node:fs";
import { resolve } from "node:path";

/** Dojo-owned installation boundary, not a general-purpose secret detector. */
function publishedCourseFile(path: string, authoring: boolean): boolean {
  const parts = path.replaceAll("\\", "/").split("/").filter(part => part && part !== ".");
  if (parts.some(part => part === "..")) return false;
  if (parts.some(part => [".git", ".eve", "node_modules", ".pnpm-store"].includes(part))) return false;
  if (parts.some(part => (!authoring && part === "KYOSHI.md") || part === ".dojorc" || part === ".dojo-source.json")) return false;
  const dojo = parts.indexOf(".dojo");
  if (dojo < 0) return true;
  return dojo === 0 && (parts.length === 1 || parts[1] === "sensei") && parts.lastIndexOf(".dojo") === 0;
}

/** Snapshot author-owned ignore rules once for each file-selection operation. */
export function courseFileFilter(root: string, authoring = false): (path: string) => boolean {
  const ignored = isGitIgnoredSync({ cwd: root, followSymbolicLinks: false });
  return path => {
    if (!publishedCourseFile(path, authoring)) return false;
    if (path === "") return true;
    const absolute = resolve(root, path);
    return !ignored(`${absolute}${lstatSync(absolute, { throwIfNoEntry: false })?.isDirectory() ? "/" : ""}`);
  };
}
