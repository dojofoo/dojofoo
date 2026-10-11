import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import { evaluateFromAuthoring, evaluationConfiguration, executeEvaluationWorker, type EvaluationConfiguration } from "./host";
import type { EvaluationReport } from "./run";

const roots: string[] = [];
it("loads the evaluation tool in Eve's native Node runtime without a TS resolver", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--input-type=module", "--eval",
    'const tool = await import("@dojofoo/authoring/eve/evaluate"); process.stdout.write(typeof tool.createKyoshiEvaluationTool);',
  ], { env: { ...process.env, NODE_OPTIONS: "" }, timeout: 10_000 });
  expect(stdout).toBe("function");
});
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "dojo-eval-host-")); roots.push(root);
  await writeFile(join(root, "dojo.yaml"), "katas:\n  - name: first\n    template: src/first/solution.ts\n  - name: second\n    template: src/second/solution.ts\n");
  for (const lesson of ["first", "second"]) {
    await mkdir(join(root, "src", lesson), { recursive: true });
    await writeFile(join(root, "src", lesson, "SENSEI.md"), "# Lesson\n");
  }
  const workerPath = join(root, "worker.js"); await writeFile(workerPath, "");
  const config: EvaluationConfiguration = { workerPath, teachingHarness: "codex", teachingModel: "teacher", fixtureHarness: "pi", fixtureModel: "fixture" };
  const report: EvaluationReport = { version: 1, directory: "/evidence", materialHash: "hash", lessonIds: ["first"], status: "teaching-failed", stage: "teaching", startedAt: "start", completedAt: "end" };
  const run = vi.fn(async () => report);
  const evaluate = (callId: string, lessonIds = ["first"]) => evaluateFromAuthoring({ root, lessonIds, callId, config, signal: AbortSignal.timeout(5000), run });
  return { root, config, run, evaluate };
}

it("does not silently select models or enable paid evaluations", () => {
  expect(evaluationConfiguration({})).toBeUndefined();
  expect(() => evaluationConfiguration({ DOJOFOO_EVAL_WORKER: "/worker" })).toThrow("together");
});
it("returns an existing receipt on replay without consuming another attempt", async () => {
  const f = await fixture(); const first = await f.evaluate("same");
  expect(first.remaining).toBe(2);
  expect(await f.evaluate("same")).toEqual(first);
  expect(f.run).toHaveBeenCalledOnce();
});
it("enforces three attempts even across new host invocations", async () => {
  const f = await fixture();
  for (const id of ["one", "two", "three"]) await f.evaluate(id);
  await expect(f.evaluate("four")).rejects.toThrow("allowance exhausted");
  expect(f.run).toHaveBeenCalledTimes(3);
});
it("cannot expand the scope to unknown lessons", async () => {
  const f = await fixture();
  await expect(f.evaluate("one", ["elsewhere"])).rejects.toThrow("not in this course");
  expect(f.run).not.toHaveBeenCalled();
});
it("identifies malformed authored YAML before spending an evaluation attempt", async () => {
  const f = await fixture();
  await writeFile(join(f.root, "dojo.yaml"), "name: Arrays: largest\nkatas:\n  - name: first\n");
  await expect(f.evaluate("same")).rejects.toMatchObject({
    name: "MaterialFailure", message: expect.stringContaining("Invalid authored dojo.yaml"),
  });
  expect(f.run).not.toHaveBeenCalled();
  await writeFile(join(f.root, "dojo.yaml"), 'name: "Arrays: largest"\nkatas:\n  - name: first\n    template: src/first/solution.ts\n');
  expect((await f.evaluate("same")).attempt).toBe(1);
});
it.each(["null", "name: Draft", "katas: [null]", "katas: [{}]"])(
  "rejects an invalid authored manifest shape without spending allowance: %s",
  async (source) => {
    const f = await fixture();
    await writeFile(join(f.root, "dojo.yaml"), source);
    await expect(f.evaluate("same")).rejects.toMatchObject({ name: "MaterialFailure" });
    expect(f.run).not.toHaveBeenCalled();
    await writeFile(join(f.root, "dojo.yaml"), "katas:\n  - name: first\n    template: src/first/solution.ts\n");
    expect((await f.evaluate("same")).attempt).toBe(1);
  },
);
it("preserves a missing workspace file as infrastructure, not bad teaching material", async () => {
  const f = await fixture();
  await rm(join(f.root, "dojo.yaml"));
  await expect(f.evaluate("missing")).rejects.toMatchObject({ code: "ENOENT" });
  expect(f.run).not.toHaveBeenCalled();
});
it("retains an uncertain worker failure rather than silently restarting it on replay", async () => {
  const f = await fixture(); f.run.mockRejectedValue(new Error("worker disconnected"));
  await expect(f.evaluate("same")).rejects.toThrow("worker disconnected");
  await expect(f.evaluate("same")).rejects.toThrow("already started");
  expect(f.run).toHaveBeenCalledOnce();
});
it("counts reordered continuity requests against the same allowance", async () => {
  const f = await fixture();
  await f.evaluate("one", ["first", "second"]);
  await f.evaluate("two", ["second", "first"]);
  await f.evaluate("three", ["first", "second"]);
  await expect(f.evaluate("four", ["second", "first"])).rejects.toThrow("allowance exhausted");
});

it("accepts a completed failure report from a real worker exit 1 without treating it as a transport error", async () => {
  const f = await fixture();
  await writeFile(f.config.workerPath, `console.log("Progress output"); console.log(JSON.stringify({version:1,completedAt:"end",status:"teaching-failed",directory:process.env.DOJOFOO_HANDOFF_MODEL})); process.exitCode=1;`);
  const report = await executeEvaluationWorker(f.root, ["first"], f.config, AbortSignal.timeout(5000));
  expect(report.status).toBe("teaching-failed");
  expect(report.directory).toBe("teacher");
});

it.each([
  { profile: "struggling" as const, mode: "--evaluate" },
  { profile: "confident" as const, mode: "--evaluate-heldout" },
])("launches the correct worker mode for $profile", async ({ profile, mode }) => {
  const f = await fixture();
  await writeFile(f.config.workerPath, `console.log(JSON.stringify({version:1,completedAt:"end",status:"passed",directory:process.argv[2],lessonIds:process.argv.slice(4)}));`);
  const report = await executeEvaluationWorker(f.root, ["first", "second"], f.config, AbortSignal.timeout(5000), profile);
  expect(report.directory).toBe(mode);
  expect(report.lessonIds).toEqual(["first", "second"]);
});

it("consumes one attempt when the same call is delivered concurrently", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.evaluate("same"), f.evaluate("same"), f.evaluate("same")]);
  expect(results.filter(result => result.status === "fulfilled")).not.toHaveLength(0);
  expect(f.run).toHaveBeenCalledOnce();
  expect((await f.evaluate("next")).attempt).toBe(2);
  for (const result of results) {
    if (result.status === "rejected") expect(result.reason.message).toContain("already started");
  }
});
it("accepts an MDX-only lesson", async () => {
  const f = await fixture();
  await rm(join(f.root, "src", "first", "SENSEI.md"));
  await writeFile(join(f.root, "src", "first", "SENSEI.mdx"), "# Lesson\n");
  expect((await f.evaluate("same")).attempt).toBe(1);
  expect(f.run).toHaveBeenCalledOnce();
});
it("rejects missing guidance before spending an attempt", async () => {
  const f = await fixture();
  await rm(join(f.root, "src", "first", "SENSEI.md"));
  await expect(f.evaluate("same")).rejects.toMatchObject({ name: "MaterialFailure" });
  expect(f.run).not.toHaveBeenCalled();
  await writeFile(join(f.root, "src", "first", "SENSEI.md"), "# Restored");
  expect((await f.evaluate("same")).attempt).toBe(1);
});
