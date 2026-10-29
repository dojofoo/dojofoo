import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { courseFileFilter } from "./publication";

function course() {
  const root = mkdtempSync(resolve(tmpdir(), "dojo-ignore-"));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

it("uses author-owned nested ignore rules and negations instead of guessing sensitive filenames", () => {
  const root = course();
  mkdirSync(resolve(root, "lessons"));
  writeFileSync(resolve(root, ".gitignore"), ".env*\n!.env.example\nbuild/\n");
  writeFileSync(resolve(root, "lessons/.gitignore"), "*.local\n!public.local\n");
  const include = courseFileFilter(root);
  for (const path of [".env", ".env.production", "build/output.txt", "lessons/private.local"]) expect(include(path), path).toBe(false);
  for (const path of ["dojo.yaml", ".env.example", "lessons/public.local", "signing.key", "mise.local.toml"]) expect(include(path), path).toBe(true);
  writeFileSync(resolve(root, ".gitignore"), "*.key\n");
  expect(courseFileFilter(root)("signing.key")).toBe(false);
});

it("installs Sensei definitions and excludes retired Kyoshi overrides in every mode", () => {
  const root = course();
  for (const authoring of [false, true]) {
    const include = courseFileFilter(root, authoring);
    for (const path of ["LICENSE", "DOJO.md", "chapters/01/README.md", ".dojo/sensei/skills/help/SKILL.md", ".dojo/sensei/tools/help.ts"]) expect(include(path), path).toBe(true);
    expect(include("KYOSHI.md")).toBe(authoring);
    for (const path of ["../outside", ".dojo/config.yaml", ".dojo/state/history.json", ".dojo/sensei/.eve/history.json", ".dojo/kyoshi/instructions.md", ".dojo/kyoshi/.eve/history.json", ".dojo/kyoshi-app/agent.ts", ".dojo/kyoshi-harness/course", ".dojo/kyoshi.json", ".dojo/evaluations/report.json", "node_modules/code.js"]) expect(include(path), path).toBe(false);
  }
});

it("does not traverse directory-link cycles while discovering author ignore files", () => {
  const root = course();
  mkdirSync(resolve(root, "links"));
  symlinkSync(root, resolve(root, "links/back"), "dir");
  writeFileSync(resolve(root, ".gitignore"), "*.local\n");
  const include = courseFileFilter(root);
  expect(include("dojo.yaml")).toBe(true);
  expect(include("private.local")).toBe(false);
});
