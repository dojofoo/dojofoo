import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import chain, { chainJudgePrompt, chainPrompts } from "../authoring/evals/authoring-chain.eval";
import { chainRubricVersion } from "@dojofoo/authoring/evaluation/prompts/suites";
import { criterionIds } from "@dojofoo/authoring/evaluation/judges";
import { judgeMaterial } from "../authoring/evals/local-judges";
import { verifyCourse } from "../authoring/evals/verify-course";

vi.mock("../authoring/evals/local-judges", async importOriginal => ({
  ...await importOriginal<typeof import("../authoring/evals/local-judges")>(),
  judgeMaterial: vi.fn(async () => judgeResults(true)),
}));
vi.mock("../authoring/evals/verify-course", () => ({ verifyCourse: vi.fn(async () => [{ report: { total: 2, failed: 2 }, learnerFileObserved: true }]) }));
const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function runFixture(authorsFiles: boolean, batch = false, failed: boolean | "send" = false, editsOtherLesson = false) {
  const root = await mkdtemp(join(tmpdir(), "kyoshi-chain-test-"));
  roots.push(root);
  await mkdir(join(root, ".dojo"));
  await mkdir(join(root, "src"));
  vi.stubEnv("DOJOFOO_EVAL_WORKSPACE", root);
  vi.stubEnv("DOJOFOO_EVAL_LOCAL_JUDGES", "1");
  let turns = 0;
  const send = vi.fn(async (_prompt: string) => {
    turns++;
    if (authorsFiles) {
      const directory = join(root, `src/${turns === 2 || turns === 4 ? "002-filter" : "001-max"}`);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "SENSEI.md"), `Revision ${turns}`);
      if (editsOtherLesson && turns === 3) await writeFile(join(root, "src/002-filter/SENSEI.md"), "Changed outside the requested lesson");
      if (batch) {
        await mkdir(join(root, "src/003-premature"), { recursive: true });
        await writeFile(join(root, "src/003-premature/SENSEI.md"), "Not approved yet");
      }
    }
    if (failed === "send") throw new Error("Turn timed out");
    return {
      expectOk() { if (failed) throw new Error("Provider disconnected"); },
      events: [{ type: failed ? "turn.failed" : "turn.completed" }, { type: "message.completed", data: { message: `Turn ${turns}` } }],
    };
  });
  const context = {
    send, succeeded: vi.fn(), signal: new AbortController().signal,
    require: async (actual: unknown) => {
      if (actual === false || actual === 0) throw new Error("No authored lesson");
    },
    check: vi.fn(),
  };
  return { root, send, execute: () => chain.test(context as unknown as Parameters<typeof chain.test>[0]) };
}

it("uses one conversation, retains chronological snapshots, and judges only after authoring", async () => {
  const fixture = await runFixture(true);
  await fixture.execute();
  expect(fixture.send).toHaveBeenCalledTimes(2);
  expect(judgeMaterial).toHaveBeenCalledTimes(1);
  const instructions = await readFile(join(fixture.root, ".dojo/evaluated-instructions.md"), "utf8");
  expect(instructions).toContain(await readFile(join(fixture.root, ".dojo/evaluated-KYOSHI.md"), "utf8"));
  const evidence = JSON.parse(await readFile(join(fixture.root, ".dojo/chain-evidence.json"), "utf8"));
  expect(JSON.parse(evidence["turn-1/files"])["src/001-max/SENSEI.md"]).toBe("Revision 1");
  expect(JSON.parse(evidence["turn-2/files"])["src/001-max/SENSEI.md"]).toBe("Revision 1");
  expect(JSON.parse(evidence["turn-2/files"])["src/002-filter/SENSEI.md"]).toBe("Revision 2");
});

function judgeResults(pass: boolean): Awaited<ReturnType<typeof judgeMaterial>> {
  const overall: "pass" | "fail" = pass ? "pass" : "fail";
  return ["judge-one", "judge-two"].map(judge => ({
    judge, root: "/fixture", promptHash: "fixture",
    verdict: {
      overall, limitation: "Fixture only",
      criteria: criterionIds.map(id => ({
        id, pass, evidence: "Observed fixture guidance", improvement: "Remove the task solution",
      })),
    },
  }));
}

it("preserves failed verdicts and applies one bounded, lesson-by-lesson feedback pass", async () => {
  vi.stubEnv("DOJOFOO_EVAL_REVISE", "1");
  vi.mocked(judgeMaterial).mockResolvedValueOnce(judgeResults(false)).mockResolvedValueOnce(judgeResults(true));
  const fixture = await runFixture(true);
  await fixture.execute();
  expect(fixture.send).toHaveBeenCalledTimes(4);
  expect(fixture.send.mock.calls[2]?.[0]).toContain("Revise only src/001-max/");
  expect(fixture.send.mock.calls[3]?.[0]).toContain("Revise only src/002-filter/");
  expect(judgeMaterial).toHaveBeenCalledTimes(2);
  const first = JSON.parse(await readFile(join(fixture.root, ".dojo/chain-judge-round-0.json"), "utf8"));
  const final = JSON.parse(await readFile(join(fixture.root, ".dojo/chain-judge-results.json"), "utf8"));
  expect(first[0].verdict.overall).toBe("fail");
  expect(final[0].verdict.overall).toBe("pass");
  const evidence = JSON.parse(await readFile(join(fixture.root, ".dojo/chain-evidence.json"), "utf8"));
  expect(JSON.parse(evidence["handoff/files"])["src/002-filter/SENSEI.md"]).toBe("Revision 4");
});

it("does not run a feedback pass when both judges already pass", async () => {
  vi.stubEnv("DOJOFOO_EVAL_REVISE", "1");
  vi.mocked(judgeMaterial).mockResolvedValueOnce(judgeResults(true));
  const fixture = await runFixture(true);
  await fixture.execute();
  expect(fixture.send).toHaveBeenCalledTimes(2);
  expect(judgeMaterial).toHaveBeenCalledTimes(1);
});

it("retains a failed final verdict rather than retrying until judges pass", async () => {
  vi.stubEnv("DOJOFOO_EVAL_REVISE", "1");
  vi.mocked(judgeMaterial).mockResolvedValueOnce(judgeResults(false)).mockResolvedValueOnce(judgeResults(false));
  const fixture = await runFixture(true);
  await fixture.execute();
  expect(fixture.send).toHaveBeenCalledTimes(4);
  expect(judgeMaterial).toHaveBeenCalledTimes(2);
  const final = JSON.parse(await readFile(join(fixture.root, ".dojo/chain-judge-results.json"), "utf8"));
  expect(final.every((result: { verdict: { overall: string } }) => result.verdict.overall === "fail")).toBe(true);
});

it("rejects feedback edits that change another lesson", async () => {
  vi.stubEnv("DOJOFOO_EVAL_REVISE", "1");
  vi.mocked(judgeMaterial).mockResolvedValueOnce(judgeResults(false));
  const fixture = await runFixture(true, false, false, true);
  await expect(fixture.execute()).rejects.toThrow();
  expect(fixture.send).toHaveBeenCalledTimes(3);
  expect(judgeMaterial).toHaveBeenCalledTimes(1);
});

it("does not turn a judge infrastructure failure into author feedback", async () => {
  vi.stubEnv("DOJOFOO_EVAL_REVISE", "1");
  vi.mocked(judgeMaterial).mockRejectedValueOnce(new Error("Judge timed out"));
  const fixture = await runFixture(true);
  await expect(fixture.execute()).rejects.toThrow("Judge timed out");
  expect(fixture.send).toHaveBeenCalledTimes(2);
});

it("does not pay judges or continue after a completed turn without authored material", async () => {
  const fixture = await runFixture(false);
  await expect(fixture.execute()).rejects.toThrow("No authored lesson");
  expect(fixture.send).toHaveBeenCalledTimes(1);
  expect(judgeMaterial).not.toHaveBeenCalled();
});

it("retains partial material and failed-turn evidence without grading an infrastructure failure", async () => {
  const fixture = await runFixture(true, false, true);
  await expect(fixture.execute()).rejects.toThrow("Provider disconnected");
  const evidence = JSON.parse(await readFile(join(fixture.root, ".dojo/chain-evidence.json"), "utf8"));
  expect(evidence["turn-1/events"]).toContain("turn.failed");
  expect(JSON.parse(evidence["turn-1/files"])["src/001-max/SENSEI.md"]).toBe("Revision 1");
  expect(fixture.send).toHaveBeenCalledTimes(1);
  expect(judgeMaterial).not.toHaveBeenCalled();
});

it("retains partial files when sending never returns a completed turn", async () => {
  const fixture = await runFixture(true, false, "send");
  await expect(fixture.execute()).rejects.toThrow("Turn timed out");
  const evidence = JSON.parse(await readFile(join(fixture.root, ".dojo/chain-evidence.json"), "utf8"));
  expect(evidence["turn-1/infrastructureFailure"]).toBe("Turn timed out");
  expect(JSON.parse(evidence["turn-1/files"])["src/001-max/SENSEI.md"]).toBe("Revision 1");
  expect(judgeMaterial).not.toHaveBeenCalled();
});

it("rejects batch-authored lessons before asking judges", async () => {
  const fixture = await runFixture(true, true);
  await expect(fixture.execute()).rejects.toThrow();
  expect(fixture.send).toHaveBeenCalledTimes(1);
  expect(judgeMaterial).not.toHaveBeenCalled();
});

it("renders the chain judge from Markdown with every criterion and no unfilled slots", () => {
  const prompt = chainJudgePrompt({ dialogue: "{{evidence-is-data}}" }, {});
  for (const id of criterionIds) expect(prompt).toContain(`## ${id}`);
  expect(prompt).toContain(chainRubricVersion);
  expect(prompt).toContain("{{evidence-is-data}}");
  expect(prompt.replace(/EVIDENCE:[\s\S]*$/u, "")).not.toMatch(/\{\{/u);
});

it("supplies learning goals, not extra human coaching about how to teach", () => {
  expect(chainPrompts).toHaveLength(2);
  expect(chainPrompts.join("\n")).not.toMatch(/felt cold|reason to care|without giving the solution|Make it feel|welcom|small step/i);
});

it("does not accept an empty or duplicate judge panel", async () => {
  vi.mocked(judgeMaterial).mockResolvedValueOnce([]);
  const fixture = await runFixture(true);
  await expect(fixture.execute()).rejects.toThrow("two distinct judge verdicts");
  vi.mocked(judgeMaterial).mockResolvedValueOnce([judgeResults(true)[0]!, judgeResults(true)[0]!]);
  const duplicate = await runFixture(true);
  await expect(duplicate.execute()).rejects.toThrow("two distinct judge verdicts");
});

it("does not pay judges when the real lesson command cannot run the tests", async () => {
  vi.mocked(verifyCourse).mockResolvedValueOnce([{ report: { total: 0, failed: 0, error: "Permission denied" } }] as never);
  const fixture = await runFixture(true);
  await expect(fixture.execute()).rejects.toThrow();
  expect(judgeMaterial).not.toHaveBeenCalled();
});

it("rejects tests wired to a bundled stub before judging", async () => {
  vi.mocked(verifyCourse).mockResolvedValueOnce([{ report: { total: 2, failed: 2 }, learnerFileObserved: false }] as never);
  const fixture = await runFixture(true);
  await expect(fixture.execute()).rejects.toThrow();
  expect(judgeMaterial).not.toHaveBeenCalled();
});
