import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { scaffoldAuthoringWorkspace } from "./scaffold";

it("runs the authored stub locally but the edited learner file in a trial", () => {
  const root = mkdtempSync(resolve(tmpdir(), "dojo-template-runner-"));
  const course = resolve(root, "course");
  const workspace = resolve(root, "learner");
  const dependencies = fileURLToPath(new URL("../node_modules", import.meta.url));
  try {
    scaffoldAuthoringWorkspace({ root: course, name: "Runner regression", style: "katas" });
    symlinkSync(dependencies, resolve(course, "node_modules"), "dir");
    mkdirSync(resolve(course, "src/001-example"), { recursive: true });
    mkdirSync(resolve(workspace, "katas/001-example"), { recursive: true });
    writeFileSync(resolve(course, "src/001-example/solution.ts"), "export const answer = 0;");
    writeFileSync(resolve(course, "src/001-example/solution.test.ts"), 'import { expect, it } from "vitest"; import { answer } from "@/katas/001-example/solution"; it("reads the active implementation", () => expect(answer).toBe(42));');
    const learner = resolve(workspace, "katas/001-example/solution.ts");
    writeFileSync(learner, "export const answer = 42;");
    const run = (projectRoot: string) => {
      try {
        return execFileSync(process.execPath, [resolve(dependencies, "vitest/vitest.mjs"), "run", "--reporter=json"], {
          cwd: course, encoding: "utf8", timeout: 30_000,
          env: { ...process.env, DOJO_PROJECT_ROOT: projectRoot }, stdio: "pipe",
        });
      } catch (error) {
        return (error as { stdout: Buffer }).stdout.toString();
      }
    };
    expect(JSON.parse(run("")).numFailedTests).toBe(1);
    expect(JSON.parse(run(workspace)).numPassedTests).toBe(1);
    writeFileSync(learner, "export const answer = 0;");
    expect(JSON.parse(run(workspace)).numFailedTests).toBe(1);
    writeFileSync(learner, 'export const answer = 0; throw new Error("Dojo learner-file wiring probe");');
    expect(JSON.parse(run(workspace)).numTotalTests).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
