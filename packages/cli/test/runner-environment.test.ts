import { afterEach, expect, it, vi } from "vitest";
import type { DojoManifest, ResolvedKata } from "../src/config";

const execSync = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execSync }));
import { runTests } from "../src/runner";

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it("targets the isolated learner workspace without changing the authoring process environment", () => {
  vi.stubEnv("DOJO_PROJECT_ROOT", "/authoring");
  execSync.mockReturnValue(Buffer.from(""));
  const kata: ResolvedKata = { name: "first", template: "solution.ts", workspacePath: "/trial/katas/first/solution.ts", testPath: "/trial/.dojos/course/solution.test.ts", senseiPath: "SENSEI.md", dojoKataDir: "/trial/.dojos/course" };
  const catalog = { test: "test-command", runner: { adapter: "exit-code" } } as DojoManifest;
  expect(runTests(kata, catalog, "/trial/.dojos/course", "/trial").passed).toBe(1);
  expect(execSync.mock.calls[0][1]).toMatchObject({ cwd: "/trial/.dojos/course", env: { DOJO_PROJECT_ROOT: "/trial" } });
  expect(process.env.DOJO_PROJECT_ROOT).toBe("/authoring");
});
