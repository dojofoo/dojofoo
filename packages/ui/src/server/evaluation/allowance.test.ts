import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { EvaluationReport } from "@dojofoo/authoring/evaluation/run";
import { withAllowance } from "./allowance";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "dojo-allowance-")); roots.push(root);
  const report: EvaluationReport = { version: 1, directory: "/evidence", materialHash: "hash", lessonIds: ["first"], status: "teaching-failed", stage: "teaching", startedAt: "start", completedAt: "end" };
  const run = vi.fn(async (_signal: AbortSignal) => report);
  const evaluate = (callId: string, lessonIds = ["first"]) => withAllowance(root, lessonIds, callId, run, AbortSignal.timeout(5000));
  return { root, run, evaluate };
}

it("returns an existing receipt on replay without consuming another attempt", async () => {
  const f = fixture(); const first = await f.evaluate("same");
  expect(first.remaining).toBe(2);
  expect(await f.evaluate("same")).toEqual(first);
  expect(f.run).toHaveBeenCalledOnce();
});

it("enforces three attempts even across new host invocations", async () => {
  const f = fixture();
  for (const id of ["one", "two", "three"]) await f.evaluate(id);
  await expect(f.evaluate("four")).rejects.toMatchObject({ name: "EvaluationRefused", code: "allowance_exhausted", message: expect.stringContaining("allowance exhausted") });
  expect(f.run).toHaveBeenCalledTimes(3);
});

it("returns a crash as an infrastructure failure and replays it without restarting", async () => {
  const f = fixture(); f.run.mockRejectedValue(new Error("trial disconnected"));
  const first = await f.evaluate("same");
  expect(first).toMatchObject({ attempt: 1, remaining: 2, report: { status: "infrastructure-failed", error: "trial disconnected" } });
  expect(await f.evaluate("same")).toEqual(first);
  expect(f.run).toHaveBeenCalledOnce();
});

it("counts reordered continuity requests against the same allowance", async () => {
  const f = fixture();
  await f.evaluate("one", ["first", "second"]);
  await f.evaluate("two", ["second", "first"]);
  await f.evaluate("three", ["first", "second"]);
  await expect(f.evaluate("four", ["second", "first"])).rejects.toThrow("allowance exhausted");
});

it("consumes one attempt when the same call is delivered concurrently", async () => {
  const f = fixture();
  const results = await Promise.allSettled([f.evaluate("same"), f.evaluate("same"), f.evaluate("same")]);
  expect(results.filter(result => result.status === "fulfilled")).not.toHaveLength(0);
  expect(f.run).toHaveBeenCalledOnce();
  expect((await f.evaluate("next")).attempt).toBe(2);
  for (const result of results) {
    if (result.status === "rejected") expect(result.reason.message).toContain("already started");
  }
});
