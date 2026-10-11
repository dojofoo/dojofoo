import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ path: "", runTests: vi.fn() }));
vi.mock("@dojofoo/config", () => ({
  readDojoRc: () => ({}), readCatalog: () => ({}), dojoDir: (root: string) => root,
  resolveAllKatas: () => [{ name: "first", workspacePath: state.path }],
}));
vi.mock("../src/runner", () => ({ runTests: state.runTests }));
import { verifyLearnerFixtures } from "../src/fixture-preflight";

const roots: string[] = [];
const fixtures = { first: { misconception: "Empty is zero", wrong: "wrong", solved: "solved", review: "Why?" } };
afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "dojo-fixture-preflight-")); roots.push(root);
  state.path = join(root, "solution.ts");
  state.runTests.mockImplementation(() => {
    const solved = readFileSync(state.path, "utf8") === "solved";
    return { total: 2, passed: solved ? 2 : 1, failed: solved ? 0 : 1, skipped: 0, error: null, tests: [] };
  });
  return () => verifyLearnerFixtures(root, "course", fixtures, ["first"], AbortSignal.timeout(5000));
}

it("checks both source variants and restores the exact original scaffold", async () => {
  const run = await setup(); await writeFile(state.path, "original scaffold\n");
  const reports = await run();
  expect(reports.map(item => item.variant)).toEqual(["wrong", "solved"]);
  expect(state.runTests.mock.calls[0][3]).toBe(roots[0]);
  expect(await readFile(state.path, "utf8")).toBe("original scaffold\n");
});

it("removes only the temporary learner file if the lesson has not been started", async () => {
  const run = await setup(); await run();
  expect(existsSync(state.path)).toBe(false);
});

it("rejects ineffective wrong code and restores the scaffold even on failure", async () => {
  const run = await setup(); await writeFile(state.path, "stub");
  state.runTests.mockReturnValue({ total: 2, passed: 2, failed: 0, error: null });
  await expect(run()).rejects.toThrow("wrong must fail");
  expect(await readFile(state.path, "utf8")).toBe("stub");
  expect(state.runTests).toHaveBeenCalledOnce();
});

it("rejects a proposed solution that fails actual authored checks", async () => {
  const run = await setup();
  state.runTests.mockReturnValue({ total: 2, passed: 1, failed: 1, error: null });
  await expect(run()).rejects.toThrow("solved must pass");
  expect(existsSync(state.path)).toBe(false);
});

it("does not treat a syntax or test-runner error as a learner misconception", async () => {
  const run = await setup();
  state.runTests.mockReturnValue({ total: 0, passed: 0, failed: 0, error: "SyntaxError" });
  await expect(run()).rejects.toThrow("SyntaxError");
  expect(existsSync(state.path)).toBe(false);
});
