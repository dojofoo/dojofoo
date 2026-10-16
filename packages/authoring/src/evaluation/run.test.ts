import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { criterionIds, type judgeMaterial } from "./judges";
import { evaluateAuthoredCourse } from "./run";
import { TeachingFailure } from "./failure";
import { materialHash } from "./material";
import { teachingRubricVersion } from "./teaching-rubric";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
function panel(pass = true): Awaited<ReturnType<typeof judgeMaterial>> {
  return ["first", "second"].map(judge => ({ judge, root: "/judge", promptHash: "hash", verdict: {
    overall: pass ? "pass" : "fail", limitation: "Simulated teaching only",
    criteria: criterionIds.map(id => ({ id, pass, evidence: "Observed turn", improvement: pass ? "" : "Teach the missing concept" })),
  } }));
}
const stages = ["introduction", "uncertainty", "unfamiliar-terminology", "misconception", "failure-1", "failure-2", "frustration", "independence", "success", "review"];
function taught(lessonId: string): Array<Record<string, unknown> & { stage?: string }> {
  return [
    { lessonId, sessionId: `session-${lessonId}` },
    ...stages.map(stage => ({ lessonId, stage, learnerMessage: "Learner input", parts: [{ type: "text-delta", delta: "Teaching" }, { type: "reasoning-delta", delta: "private" }] })),
  ];
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "dojo-evaluate-")); roots.push(root);
  await mkdir(join(root, "src")); await mkdir(join(root, "trial"));
  await writeFile(join(root, "DOJO.md"), "Teach the learner");
  await writeFile(join(root, "dojo.yaml"), "name: Example\nkatas:\n  - name: first\n    template: src/first/solution.ts\n  - name: second\n    template: src/second/solution.ts\n  - name: third\n    template: src/third/solution.ts\n");
  for (const lesson of ["first", "second", "third"]) {
    await mkdir(join(root, "src", lesson)); await writeFile(join(root, "src", lesson, "SENSEI.md"), `# ${lesson}`);
  }
  // Only the last requested lesson is taught; earlier lessons are prior progress.
  const turns = [{ lessonId: "first", fastForward: true }, ...taught("second"), { deterministicLifecycle: "passed" }];
  await writeFile(join(root, "trial/evidence.json"), JSON.stringify(turns));
  const trial = vi.fn(async () => join(root, "trial"));
  const judge = vi.fn<typeof judgeMaterial>().mockResolvedValue(panel());
  const run = () => evaluateAuthoredCourse({ root, lessonIds: ["first", "second"], signal: AbortSignal.timeout(5000), trial, judge });
  return { root, trial, judge, run, turns };
}

it("uses both judge panels and actual production transcript, excluding private reasoning", async () => {
  const f = await fixture(); const report = await f.run();
  expect(report.status).toBe("passed");
  expect(f.trial).toHaveBeenCalledOnce(); expect(f.judge).toHaveBeenCalledTimes(2);
  expect(f.judge.mock.calls[1][0].transcript).toContain("Learner input");
  expect(f.judge.mock.calls[1][0].transcript).not.toContain("private");
  expect(f.judge.mock.calls[1][0].rubric).toBe(teachingRubricVersion);
  expect(JSON.parse(await readFile(join(report.directory, "report.json"), "utf8"))).toEqual(report);
});
it("does not pay for a trial after a material failure", async () => {
  const f = await fixture(); f.judge.mockResolvedValue(panel(false));
  expect((await f.run()).status).toBe("material-failed"); expect(f.trial).not.toHaveBeenCalled();
});
it("keeps the lockfile in the reproducible snapshot, not the pedagogical judge prompt", async () => {
  const f = await fixture();
  await writeFile(join(f.root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  const report = await f.run();
  expect(report.status).toBe("passed");
  expect(f.judge.mock.calls[0][0]).not.toHaveProperty("pnpm-lock.yaml");
  const snapshot = JSON.parse(await readFile(join(report.directory, "material.json"), "utf8"));
  expect(snapshot["pnpm-lock.yaml"]).toBe("lockfileVersion: '9.0'\n");
  expect(report.materialHash).toBe(materialHash(snapshot));
});
it("still invalidates the evaluation if the excluded lockfile changes", async () => {
  const f = await fixture();
  await writeFile(join(f.root, "pnpm-lock.yaml"), "before\n");
  f.judge.mockImplementationOnce(async () => {
    await writeFile(join(f.root, "pnpm-lock.yaml"), "after\n");
    return panel();
  });
  expect((await f.run()).status).toBe("stale");
  expect(f.trial).not.toHaveBeenCalled();
});
it.each(["material", "trial", "teaching"] as const)("finalizes cancellation while %s ignores its signal", async stage => {
  const f = await fixture();
  const stopped = new AbortController();
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
  };
  const pendingJudge = deferred<Awaited<ReturnType<typeof judgeMaterial>>>();
  const pendingTrial = deferred<string>();
  const hang = <T,>(pending: { promise: Promise<T> }) => {
    queueMicrotask(() => stopped.abort(new Error("Evaluation cancelled")));
    return pending.promise;
  };
  if (stage === "trial") f.trial.mockImplementationOnce(() => hang(pendingTrial));
  else if (stage === "material") f.judge.mockImplementationOnce(() => hang(pendingJudge));
  else f.judge.mockResolvedValueOnce(panel()).mockImplementationOnce(() => hang(pendingJudge));
  const result = evaluateAuthoredCourse({ root: f.root, lessonIds: ["first", "second"], signal: stopped.signal, trial: f.trial, judge: f.judge });
  try {
    const report = await result;
    expect(report).toMatchObject({ status: "infrastructure-failed", stage, error: "Evaluation cancelled" });
    expect(report.completedAt).toBeTruthy();
    expect(JSON.parse(await readFile(join(report.directory, "report.json"), "utf8"))).toEqual(report);
    const calls = f.judge.mock.calls.length;
    pendingTrial.resolve(join(f.root, "trial"));
    pendingJudge.resolve(panel());
    await new Promise(resolve => setImmediate(resolve));
    expect(f.judge).toHaveBeenCalledTimes(calls);
    expect(JSON.parse(await readFile(join(report.directory, "report.json"), "utf8"))).toEqual(report);
  } finally {
    pendingTrial.resolve(join(f.root, "trial"));
    pendingJudge.resolve(panel());
  }
}, 1000);
it("judges the production policy with authored material without copying it into course files", async () => {
  const f = await fixture();
  const report = await evaluateAuthoredCourse({ root: f.root, lessonIds: ["first", "second"], signal: AbortSignal.timeout(5000), trial: f.trial, judge: f.judge, teachingPolicy: "Teach missing knowledge before recall" });
  expect(report.status).toBe("passed");
  expect(report.teachingPolicyHash).toMatch(/^[a-f0-9]{64}$/u);
  expect(f.judge.mock.calls[0][0]["production-teaching-policy.md"]).toBe("Teach missing knowledge before recall");
  expect(await readFile(join(report.directory, "production-teaching-policy.md"), "utf8")).toBe("Teach missing knowledge before recall");
  expect(JSON.parse(await readFile(join(report.directory, "material.json"), "utf8"))).not.toHaveProperty("production-teaching-policy.md");
});
it("can evaluate the first lesson before another lesson is authored", async () => {
  const f = await fixture();
  await writeFile(join(f.root, "trial/evidence.json"), JSON.stringify([...taught("first"), { deterministicLifecycle: "passed" }]));
  const report = await evaluateAuthoredCourse({ root: f.root, lessonIds: ["first"], signal: AbortSignal.timeout(5000), trial: f.trial, judge: f.judge });
  expect(report.status).toBe("passed"); expect(report.lessonIds).toEqual(["first"]);
});
it("reports teaching failure separately and preserves both verdicts", async () => {
  const f = await fixture(); f.judge.mockResolvedValueOnce(panel()).mockResolvedValueOnce(panel(false));
  const report = await f.run(); expect(report.status).toBe("teaching-failed");
  expect(report.material).toHaveLength(2); expect(report.teaching).toHaveLength(2);
});
it("cannot pass with an empty panel", async () => {
  const f = await fixture(); f.judge.mockResolvedValue([]);
  const report = await f.run(); expect(report.status).toBe("infrastructure-failed");
  expect(report.error).toContain("two distinct"); expect(f.trial).not.toHaveBeenCalled();
});
it("preserves infrastructure failures without presenting them as teaching advice", async () => {
  const f = await fixture(); f.trial.mockRejectedValue(new Error("Provider unavailable"));
  const report = await f.run(); expect(report.status).toBe("infrastructure-failed");
  expect(report.stage).toBe("trial"); expect(report.teaching).toBeUndefined();
});
it("does not grade a Codex rate limit as a failed review or pay teaching judges", async () => {
  const f = await fixture();
  f.trial.mockRejectedValue(new Error("Codex: exceeded retry limit, last status: 429 Too Many Requests"));
  const report = await f.run();
  expect(report).toMatchObject({ status: "infrastructure-failed", stage: "trial", error: expect.stringContaining("429") });
  expect(report.teaching).toBeUndefined();
  expect(f.judge).toHaveBeenCalledTimes(1);
});
it("classifies a verified learner-ownership violation as teaching, not infrastructure", async () => {
  const f = await fixture(); f.trial.mockRejectedValue(new TeachingFailure("Sensei edited learner code"));
  const report = await f.run(); expect(report.status).toBe("teaching-failed");
  expect(report.stage).toBe("trial"); expect(f.judge).toHaveBeenCalledTimes(1);
});
it("refuses incomplete scenario evidence before paying teaching judges", async () => {
  const f = await fixture();
  await writeFile(join(f.root, "trial/evidence.json"), JSON.stringify([{ deterministicLifecycle: "passed" }]));
  const report = await f.run(); expect(report.status).toBe("infrastructure-failed");
  expect(f.judge).toHaveBeenCalledTimes(1);
});
it.each([
  { parts: [] },
  { parts: [{ type: "reasoning-delta", delta: "Private analysis" }] },
  { parts: [{ type: "text-delta", delta: "  " }] },
])("rejects an explanation stage without public teaching: $parts", async ({ parts }) => {
  const f = await fixture();
  const turns = f.turns.map(turn => "stage" in turn && turn.stage === "uncertainty" ? { ...turn, parts } : turn);
  await writeFile(join(f.root, "trial/evidence.json"), JSON.stringify(turns));
  const report = await f.run();
  expect(report.status).toBe("infrastructure-failed");
  expect(report.error).toContain("Missing learner-visible teaching: second/uncertainty");
  expect(f.judge).toHaveBeenCalledTimes(1);
});
it("allows silent check observations without mistaking them for missing explanations", async () => {
  const f = await fixture();
  const turns = f.turns.map(turn => "stage" in turn && turn.stage === "failure-1" ? { ...turn, parts: [] } : turn);
  await writeFile(join(f.root, "trial/evidence.json"), JSON.stringify(turns));
  expect((await f.run()).status).toBe("passed");
});

it("validates the confident scenario without claiming it tested struggle", async () => {
  const f = await fixture();
  const turns = [{ learnerProfile: "confident" }, ...f.turns.filter(turn => !("stage" in turn) || ["introduction", "success", "review"].includes(turn.stage!))];
  turns.splice(1, 0, { lessonId: "second", stage: "quick-understanding", learnerMessage: "My explanation", parts: [{ type: "text-delta", delta: "Your explanation fits" }] });
  await writeFile(join(f.root, "trial/evidence.json"), JSON.stringify(turns));
  expect((await f.run()).status).toBe("passed");
  expect(f.judge.mock.calls[1][0].learnerProfile).toBe("confident");
  await writeFile(join(f.root, "trial/evidence.json"), JSON.stringify(turns.filter(turn => !("stage" in turn) || turn.stage !== "quick-understanding")));
  expect((await f.run()).error).toContain("quick-understanding");
});
it("invalidates verdicts if the author changes material during evaluation", async () => {
  const f = await fixture(); f.trial.mockImplementation(async () => {
    await writeFile(join(f.root, "DOJO.md"), "Changed while evaluating"); return join(f.root, "trial");
  });
  expect((await f.run()).status).toBe("stale"); expect(f.judge).toHaveBeenCalledTimes(1);
});

it("judges only the requested lessons and ignores edits to other lessons", async () => {
  const f = await fixture();
  f.trial.mockImplementation(async () => {
    await writeFile(join(f.root, "src/third/SENSEI.md"), "Unfinished neighbour"); return join(f.root, "trial");
  });
  const report = await f.run();
  expect(report.status).toBe("passed");
  expect(Object.keys(f.judge.mock.calls[0][0]).filter(path => path.startsWith("src/"))).toEqual(["src/first/SENSEI.md", "src/second/SENSEI.md"]);
  expect(JSON.parse(f.judge.mock.calls[0][0]["evaluation-scope.json"]).lessonIds).toEqual(["first", "second"]);
  expect(JSON.parse(f.judge.mock.calls[0][0]["evaluation-scope.json"])).toMatchObject({ teachingLessonId: "second", completedBefore: ["first"] });
});
it("rejects evidence that taught a prior lesson again", async () => {
  const f = await fixture();
  await writeFile(join(f.root, "trial/evidence.json"), JSON.stringify([...taught("first"), ...taught("second"), { deterministicLifecycle: "passed" }]));
  expect((await f.run()).error).toContain("requested isolated lesson sessions");
});

it("fails a split teaching verdict while preserving the disagreement", async () => {
  const f = await fixture();
  const split = panel(); split[0]!.verdict = { ...split[0]!.verdict, overall: "fail", criteria: split[0]!.verdict.criteria.map(c => c.id === "adaptive-instruction" ? { ...c, pass: false } : c) };
  f.judge.mockResolvedValueOnce(panel()).mockResolvedValueOnce(split);
  const report = await f.run();
  expect(report.status).toBe("teaching-failed");
  expect(report.decisions?.teaching?.disputed).toEqual([{ id: "adaptive-instruction", judges: ["first"] }]);
});
it("does not pay for a trial while either material judge still fails a criterion", async () => {
  const f = await fixture();
  const split = panel();
  split[0]!.verdict = { ...split[0]!.verdict, overall: "fail", criteria: split[0]!.verdict.criteria.map(c =>
    c.id === "adaptive-instruction" ? { ...c, pass: false } : c) };
  f.judge.mockResolvedValueOnce(split);
  const report = await f.run();
  expect(report.status).toBe("material-failed");
  expect(f.trial).not.toHaveBeenCalled();
  expect(f.judge).toHaveBeenCalledTimes(1);
  expect(report.material).toEqual(split);
  expect(report.decisions?.material?.disputed).toEqual([{ id: "adaptive-instruction", judges: ["first"] }]);
});
it("fails when either judge finds a solution leak", async () => {
  const f = await fixture();
  const leak = panel(); leak[1]!.verdict = { ...leak[1]!.verdict, overall: "fail", criteria: leak[1]!.verdict.criteria.map(c => c.id === "solution-withholding" ? { ...c, pass: false } : c) };
  f.judge.mockResolvedValueOnce(leak);
  expect((await f.run()).status).toBe("material-failed");
});
