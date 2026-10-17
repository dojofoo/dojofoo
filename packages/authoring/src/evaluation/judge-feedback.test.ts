import { expect, it } from "vitest";
import { criterionIds, judgePrompt, judgeSchema, localJudges } from "./judges";
import { criterionSections, evaluationPrompts, solutionBoundary, teachingJudgePrompt } from "./prompts";
import { promptSlots } from "../prompts";
import { chainJudgePrompt } from "./prompts/suites";

// These tests pin structure, not semantic calibration or teaching quality:
// one definition per criterion, shared by both judges, with no unfilled slots.
it("defines each verdict criterion exactly once in CRITERIA.md", () => {
  expect(Object.keys(criterionSections)).toEqual([...criterionIds]);
});

it("isolates Codex judge outputs and preserves the mixed panel", () => {
  const judges = localJudges("/fixture", "codex");
  expect(judges.map(judge => judge.command)).toEqual(["codex", "codex"]);
  expect(new Set(judges.map(judge => judge.id)).size).toBe(2);
  expect(new Set(judges.map(judge => judge.args[judge.args.indexOf("--output-last-message") + 1])).size).toBe(2);
  expect(localJudges("/fixture", "mixed").map(judge => judge.command)).toEqual(["codex", "claude"]);
  expect(() => localJudges("/fixture", "unknown")).toThrow("Evaluation judges");
});

for (const [name, buildPrompt] of [["material", judgePrompt], ["teaching", teachingJudgePrompt], ["authoring chain", chainJudgePrompt]] as const) {
  it(`${name} judge renders the shared criteria, boundary and verdict rules`, () => {
    const prompt = buildPrompt({ "SENSEI.md": "{{not-a-slot}}" }, judgeSchema);
    expect(prompt).toContain(solutionBoundary);
    expect(prompt).toContain(evaluationPrompts.verdict.trim());
    for (const id of criterionIds) expect(prompt).toContain(`## ${id}`);
    expect(prompt).toContain(JSON.stringify(judgeSchema));
    // Evidence is inserted verbatim and never re-rendered as a template.
    expect(prompt).toContain("{{not-a-slot}}");
    expect(prompt.replace(/EVIDENCE:[\s\S]*$/u, "")).not.toMatch(/\{\{/u);
  });
}

it("keeps every learner and generator prompt free of slots", () => {
  for (const name of ["fixtureGenerator", "learner", "learnerScript", "boundary"] as const) {
    expect(promptSlots(evaluationPrompts[name])).toEqual([]);
  }
});
