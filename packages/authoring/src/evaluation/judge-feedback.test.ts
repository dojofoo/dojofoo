import { expect, it } from "vitest";
import { criterionIds, judgePrompt, judgeSchema } from "./judges";
import { criterionSections, evaluationPrompts, solutionBoundary, teachingJudgePrompt } from "./prompts";
import { promptSlots } from "../prompts";

// Rubric wording is calibrated with live judges. These tests pin structure:
// one definition per criterion, shared by both judges, with no unfilled slots.
it("defines each verdict criterion exactly once in CRITERIA.md", () => {
  expect(Object.keys(criterionSections)).toEqual([...criterionIds]);
});

for (const [name, buildPrompt] of [["material", judgePrompt], ["teaching", teachingJudgePrompt]] as const) {
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
