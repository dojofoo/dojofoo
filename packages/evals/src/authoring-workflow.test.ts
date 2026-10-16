import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { readMaterial } from "@dojofoo/authoring/evaluation/material";
import { criterionIds } from "@dojofoo/authoring/evaluation/judges";
const heldout = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@dojofoo/authoring/evaluation/host", () => ({
  evaluationConfiguration: () => ({}),
  executeEvaluationWorker: heldout.run,
}));
import workflow from "../authoring/evals/authoring-workflow.eval";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
const panel = (disputed = false) => ["judge-one", "judge-two"].map((judge, index) => ({ judge, verdict: {
  overall: disputed && index === 0 ? "fail" : "pass", limitation: "Fixture",
  criteria: criterionIds.map(id => ({ id, pass: !(disputed && index === 0 && id === "engagement"), evidence: "Fixture evidence", improvement: "" })),
} }));
async function runCase({ callsTool = true, passes = true, disputed = false, heldoutDisputed = false, missingPanel = false, continuity = true, editsAfterEvaluation = false, editsEarlierLesson = false, editsSharedGuidance = false, heldoutPasses = true, heldoutChanged = false, acceptedPolicy = "policy", heldoutPolicy = "policy" } = {}) {
  heldout.run.mockReset();
  heldout.run.mockImplementation(async (_root: string, lessonIds: string[]) => ({ status: heldoutPasses ? "passed" : "teaching-failed", material: panel(), teaching: panel(heldoutDisputed), lessonIds, teachingPolicyHash: heldoutPolicy, materialHash: heldoutChanged ? "different" : "accepted" }));
  const root = await mkdtemp(join(tmpdir(), "dojo-workflow-contract-")); roots.push(root);
  await mkdir(join(root, ".dojo")); await mkdir(join(root, "src"));
  await writeFile(join(root, "DOJO.md"), "Shared learner prerequisites and course rules");
  vi.stubEnv("DOJOFOO_EVAL_WORKFLOW", "1"); vi.stubEnv("DOJOFOO_EVAL_WORKSPACE", root);
  let count = 0;
  const send = vi.fn(async (_prompt: string) => {
    count++;
    await mkdir(join(root, "src", String(count)));
    await writeFile(join(root, "src", String(count), "SENSEI.md"), "Guidance");
    await writeFile(join(root, "dojo.yaml"), JSON.stringify({ mode: "katas", katas: Array.from({ length: count }, (_, i) => ({ name: String(i + 1), template: `src/${i + 1}/kata.ts` })) }));
    if (count === 2 && editsEarlierLesson) await writeFile(join(root, "src/1/SENSEI.md"), "Earlier lesson changed during the second trial");
    if (count === 2 && editsSharedGuidance) await writeFile(join(root, "DOJO.md"), "Updated rules that also change how the first Sensei teaches");
    const directory = join(root, ".dojo/evaluations", `run-${count}`); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "material.json"), JSON.stringify(await readMaterial(root)));
    await writeFile(join(directory, "report.json"), JSON.stringify({ directory, material: missingPanel ? undefined : panel(), teaching: panel(disputed), teachingPolicyHash: acceptedPolicy, materialHash: "accepted", startedAt: String(count), status: passes ? "passed" : "teaching-failed", lessonIds: count === 2 && continuity ? ["1", "2"] : [String(count)] }));
    if (editsAfterEvaluation) await writeFile(join(root, "src", String(count), "SENSEI.md"), "Changed without another trial");
    return { expectOk() {}, events: callsTool ? [{ type: "actions.requested", data: { toolName: "dojo_authoring_evaluate" } }] : [] };
  });
  const context = { send, succeeded: vi.fn(), require: async (valid: boolean) => { if (!valid) throw new Error("Acceptance gate failed"); } };
  await workflow.test(context as unknown as Parameters<typeof workflow.test>[0]);
  return send;
}

it("uses only the learning-goal turns, with no hidden teaching coaching", async () => {
  const send = await runCase();
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0][0]).not.toContain("judge");
  expect(heldout.run).toHaveBeenCalledOnce();
  expect(heldout.run.mock.calls[0][4]).toBe("confident");
});
it("rejects authored files without an observed evaluator tool call", async () => {
  await expect(runCase({ callsTool: false })).rejects.toThrow("Acceptance gate");
});
it("rejects a failed teaching verdict even when Kyoshi finishes normally", async () => {
  await expect(runCase({ passes: false })).rejects.toThrow("Acceptance gate");
});
it.each([{ disputed: true }, { heldoutDisputed: true }, { missingPanel: true }])("requires both complete, passing judge panels: %j", async options => {
  await expect(runCase(options)).rejects.toThrow("Acceptance gate");
});
it("does not mistake two independent single-lesson passes for continuity", async () => {
  await expect(runCase({ continuity: false })).rejects.toThrow("Acceptance gate");
});
it("rejects material changed after a passing evaluation", async () => {
  await expect(runCase({ editsAfterEvaluation: true })).rejects.toThrow("Acceptance gate");
});
it("rejects changes to an earlier accepted lesson even when the latest trial passes", async () => {
  await expect(runCase({ editsEarlierLesson: true })).rejects.toThrow("Acceptance gate");
  expect(heldout.run).not.toHaveBeenCalled();
});
it("does not certify the first lesson after a second lesson changes shared guidance", async () => {
  await expect(runCase({ editsSharedGuidance: true })).rejects.toThrow("Acceptance gate");
  expect(heldout.run).not.toHaveBeenCalled();
});
it("rejects a held-out failure without another author coaching turn", async () => {
  await expect(runCase({ heldoutPasses: false })).rejects.toThrow("Acceptance gate");
  expect(heldout.run).toHaveBeenCalledOnce();
});
it("rejects a held-out pass for different material", async () => {
  await expect(runCase({ heldoutChanged: true })).rejects.toThrow("Acceptance gate");
});
it("rejects a held-out pass using a different production teaching policy", async () => {
  await expect(runCase({ heldoutPolicy: "changed" })).rejects.toThrow("Acceptance gate");
});
it("does not count two missing policy fingerprints as a verified match", async () => {
  await expect(runCase({ acceptedPolicy: "", heldoutPolicy: "" })).rejects.toThrow("Acceptance gate");
});
