import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EvaluationReport } from "@dojofoo/authoring/evaluation/run";
import { evaluationRunner, evaluations } from "./evaluations";

const original = { ...evaluationRunner };
const roots: string[] = [];
afterEach(() => {
  Object.assign(evaluationRunner, original);
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const validSensei = "# Lesson\n\n## Start\n\n- **Hook:** h\n- **Builds on:** b\n- **First move:** f\n\n## Teach\n\n## Stumbling points\n\n## Evidence\n\n## Review\n\n- **Boundary:** b\n- **Predict:** p\n";
const consent = { enabled: true, teacher: { harness: "codex", model: "teacher" }, learner: { harness: "codex", model: "learner" } };

/** A draft that passes the request checks, on `agent`, with consent unless `enabled` is false */
function draft(agent = "opencode", enabled = true) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dojo-evaluations-")));
  roots.push(root);
  vi.stubEnv("DOJOFOO_HOME", resolve(root, "home"));
  mkdirSync(join(root, "src/first"), { recursive: true });
  writeFileSync(join(root, "src/INTRO.md"), "# Chapter\n\nWhat this chapter covers.\n");
  writeFileSync(join(root, "dojo.yaml"), "katas:\n  - name: first\n    template: src/first/solution.ts\n");
  writeFileSync(join(root, "README.md"), "# Course\n\nWhat the learner builds.\n");
  writeFileSync(join(root, "src/first/INTRO.md"), "# First\n\nWhat this lesson covers.\n");
  writeFileSync(join(root, "src/first/SENSEI.md"), validSensei);
  writeFileSync(join(root, "src/first/solution.test.ts"), 'it("works", () => {});');
  mkdirSync(join(root, ".dojo"));
  writeFileSync(join(root, ".dojo/runtimes.json"), JSON.stringify({ agent, models: { [agent]: "chosen-model" } }));
  writeFileSync(join(root, ".dojo/evaluation-settings.json"), JSON.stringify({ ...consent, enabled }));
  return root;
}

const report = (root: string): EvaluationReport => ({ version: 1, directory: join(root, ".dojo/evaluations/run-x"), materialHash: "hash", lessonIds: ["first"],
  status: "passed", stage: "teaching", startedAt: "start", completedAt: "end" });
const fakeRoles = { fixtures: vi.fn(), reply: vi.fn(), answer: vi.fn(), judge: vi.fn() };
const run = (root: string, callId: string, signal = AbortSignal.timeout(5000)) => evaluations.run({ root, lessonIds: ["first"], callId, signal });

describe("UI server evaluations", () => {
  it("a second evaluation of the same draft is refused while one runs", async () => {
    const root = draft();
    const release = Promise.withResolvers<void>();
    evaluationRunner.course = vi.fn(async () => { await release.promise; return report(root); });
    const first = run(root, "one");
    await vi.waitFor(() => expect(evaluationRunner.course).toHaveBeenCalledOnce());
    await expect(run(root, "two")).rejects.toMatchObject({ name: "EvaluationRefused", code: "evaluation_running" });
    release.resolve();
    expect(await first).toMatchObject({ attempt: 1, remaining: 2, report: { status: "passed" } });
    expect(await run(root, "two")).toMatchObject({ attempt: 2 });
  });

  it("a fourth attempt is refused", async () => {
    const root = draft();
    evaluationRunner.course = vi.fn(async () => report(root));
    for (const callId of ["one", "two", "three"]) await run(root, callId);
    await expect(run(root, "four")).rejects.toMatchObject({ name: "EvaluationRefused", code: "allowance_exhausted", message: expect.stringContaining("allowance exhausted") });
    expect(evaluationRunner.course).toHaveBeenCalledTimes(3);
  });

  it("consent off is refused before any attempt", async () => {
    const root = draft("opencode", false);
    evaluationRunner.course = vi.fn(async () => report(root));
    await expect(run(root, "one")).rejects.toMatchObject({ name: "EvaluationRefused", code: "not_enabled" });
    rmSync(join(root, ".dojo/evaluation-settings.json"));
    await expect(run(root, "one")).rejects.toMatchObject({ code: "not_enabled" });
    expect(evaluationRunner.course).not.toHaveBeenCalled();
    expect(existsSync(join(root, ".dojo/evaluation-allowances"))).toBe(false);
  });

  it("a draft on an agent that is not offered is refused", async () => {
    const root = draft("cursor");
    evaluationRunner.course = vi.fn(async () => report(root));
    await expect(run(root, "one")).rejects.toMatchObject({ name: "EvaluationRefused", code: "agent_not_offered" });
    expect(evaluationRunner.course).not.toHaveBeenCalled();
    expect(existsSync(join(root, ".dojo/evaluation-allowances"))).toBe(false);
  });

  it("a Pi draft evaluates", async () => {
    const root = draft("pi");
    evaluationRunner.roles = vi.fn(() => fakeRoles);
    evaluationRunner.trial = vi.fn(async () => "/trial");
    evaluationRunner.course = vi.fn(async input => {
      expect(await input.trial(input.signal)).toBe("/trial");
      return report(root);
    });
    expect(await run(root, "pi-call")).toMatchObject({ attempt: 1, report: { status: "passed" } });
    expect(evaluationRunner.roles).toHaveBeenCalledWith(expect.objectContaining({ agent: "pi", model: "chosen-model", stateDirectory: resolve(root, "home/state"),
      evidenceRoot: expect.stringContaining(join(root, ".dojo/handoffs/run-")) }));
    const course = vi.mocked(evaluationRunner.course).mock.calls[0]![0];
    expect(course).toMatchObject({ root, lessonIds: ["first"], priorLessons: "seed-completion", judge: fakeRoles.judge, teachingPolicy: expect.stringContaining("##") });
    expect(evaluationRunner.trial).toHaveBeenCalledWith(expect.objectContaining({ draftRoot: root, lessonIds: ["first"], roles: fakeRoles }));
  });

  it("status reports running, finished and a failure's code; cancel aborts", async () => {
    const root = draft();
    const release = Promise.withResolvers<void>();
    evaluationRunner.course = vi.fn(async () => { await release.promise; return report(root); });
    const { trialId } = evaluations.start({ root, lessonIds: ["first"], callId: "one" });
    expect(evaluations.status(trialId)).toEqual({ status: "running" });
    release.resolve();
    await vi.waitFor(() => expect(evaluations.status(trialId)).toMatchObject({ status: "finished", result: { attempt: 1, report: { status: "passed" } } }));
    const refused = evaluations.start({ root: draft("cursor"), lessonIds: ["first"], callId: "one" });
    await vi.waitFor(() => expect(evaluations.status(refused.trialId)).toMatchObject({ status: "failed", code: "agent_not_offered" }));
    // A cancelled trial's signal aborts; the allowance records it and the failure carries no code
    evaluationRunner.course = vi.fn(input => new Promise<EvaluationReport>((_resolve, reject) => input.signal.addEventListener("abort", () => reject(input.signal.reason), { once: true })));
    const cancelled = evaluations.start({ root, lessonIds: ["first"], callId: "two" });
    await vi.waitFor(() => expect(evaluationRunner.course).toHaveBeenCalledOnce());
    expect(evaluations.cancel(cancelled.trialId)).toBe(true);
    await vi.waitFor(() => expect(evaluations.status(cancelled.trialId)).toEqual({ status: "failed", error: "The evaluation was cancelled before it finished." }));
    expect(evaluations.cancel("unknown")).toBe(false);
    expect(evaluations.status("unknown")).toBeUndefined();
  });
});
