import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createStateDirectory } from "./index";

const roots: string[] = [];
function repository() {
  const root = mkdtempSync(resolve(tmpdir(), "dojo-private-state-"));
  roots.push(root);
  execFileSync("git", ["init", "--quiet", root]);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("creates a tracked ignore file before state, with no root gitignore required", () => {
  const root = repository();
  for (const id of ["course-a", "course-b"]) {
    const directory = createStateDirectory(root, id, "sessions");
    expect(readFileSync(resolve(root, ".dojo/state/.gitignore"), "utf8")).toBe("*\n!.gitignore\n");
    const file = resolve(directory, "history.json");
    writeFileSync(file, "private");
    expect(execFileSync("git", ["-C", root, "check-ignore", file], { encoding: "utf8" })).toContain("history.json");
  }
  expect(() => execFileSync("git", ["-C", root, "check-ignore", "--quiet", ".dojo/state/.gitignore"])).toThrow();
  expect(existsSync(resolve(root, ".gitignore"))).toBe(false);
});

it("does not follow state-directory symlinks or allow escaping identifiers", () => {
  const root = repository();
  mkdirSync(resolve(root, ".dojo"));
  mkdirSync(resolve(root, "outside"));
  symlinkSync(resolve(root, "outside"), resolve(root, ".dojo/state"), "dir");
  expect(() => createStateDirectory(root, "course-a")).toThrow(/symbolic link/);
  expect(existsSync(resolve(root, "outside/.gitignore"))).toBe(false);
  for (const id of ["..", "../escape", "/absolute", "a\\b"]) {
    expect(() => createStateDirectory(root, id)).toThrow();
  }
});
