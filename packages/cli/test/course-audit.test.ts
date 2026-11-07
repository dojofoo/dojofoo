import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCourseAudits } from "../src/course-audit";

const directories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("course security checks", () => {
  it("approves a download by the checks of its own version, which Git's tree hash names as the course API does", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "dojofoo-course-audit-"));
    directories.push(directory);
    mkdirSync(resolve(directory, "katas/001-first"), { recursive: true });
    mkdirSync(resolve(directory, "empty"));
    writeFileSync(resolve(directory, "dojo.yaml"), "name: course\n");
    writeFileSync(resolve(directory, "katas.md"), "# Notes\n");
    writeFileSync(resolve(directory, "katas/001-first/KATA.md"), "# First\n");
    writeFileSync(resolve(directory, "prepare.sh"), "#!/bin/sh\n");
    chmodSync(resolve(directory, "prepare.sh"), 0o755);
    symlinkSync("katas/001-first/KATA.md", resolve(directory, "link.md"));
    // `git add -A && git write-tree` over the same files: the executable bit, the symlink and Git's order (katas.md before
    // katas/) count, the empty directory doesn't. The course API has passed that version only.
    const version = "11cfc60b8709d6e2a5a46315f7883af24dc3ee69";
    vi.stubEnv("DOJO_API_URL", "https://courses.example.test");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "enabled", hash: version,
      audits: [{ provider: "Dojo", status: "pass", riskLevel: "NONE", summary: "No risks detected", hash: version, findings: [] }] })));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await checkCourseAudits("acme/course", directory, { yes: false });

    expect(log).toHaveBeenCalledWith("Security checks: Dojo pass");
  });
});
