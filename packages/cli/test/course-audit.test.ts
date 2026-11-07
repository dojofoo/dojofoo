import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCourseAudits } from "../src/course-audit";

const directories: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("course security checks", () => {
  it("names the downloaded version by its Git tree hash, as the course API names a snapshot", async () => {
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
    vi.stubEnv("DOJO_API_URL", "https://courses.example.test");
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const { hash } = (init?.body ? JSON.parse(String(init.body)) : {}) as { hash?: string };
      return Response.json({ status: "enabled", hash, audits: [{ provider: "Dojo", status: "pass", riskLevel: "NONE", summary: "No risks detected", hash, findings: [] }] });
    });
    vi.stubGlobal("fetch", fetch);

    await checkCourseAudits("acme/course", directory, { yes: false });

    expect(fetch).toHaveBeenCalledWith("https://courses.example.test/api/v1/courses/audit/acme/course", expect.objectContaining({ method: "POST" }));
    // `git add -A && git write-tree` over the same files: the executable bit, the symlink and Git's order (katas.md
    // before katas/) count, the empty directory doesn't
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ hash: "11cfc60b8709d6e2a5a46315f7883af24dc3ee69" });
  });
});
