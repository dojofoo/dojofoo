import { expect, it } from "vitest";
import { criterionIds, judgePrompt, judgeSchema, parseVerdict, requireJudgeResults } from "../authoring/evals/local-judges";

const verdict = () => ({
  criteria: criterionIds.map((id) => ({ id, pass: true, evidence: "Specific evidence", improvement: "" })),
  overall: "pass", limitation: "Material only, not observed teaching",
});
it("uses a schema draft accepted by both local judge CLIs", () => {
  expect(judgeSchema.$schema).toBe("http://json-schema.org/draft-07/schema#");
});
it("requires each teaching criterion exactly once", () => {
  expect(parseVerdict(verdict()).overall).toBe("pass");
  const duplicate = verdict();
  duplicate.criteria[3] = duplicate.criteria[0];
  expect(() => parseVerdict(duplicate)).toThrow("omitted or duplicated");
  expect(() => parseVerdict({ ...verdict(), criteria: [] })).toThrow();
});
it("does not count malformed or contradictory judge output as a pass", () => {
  expect(() => parseVerdict("looks good")).toThrow();
  const contradictory = verdict();
  contradictory.criteria[0].pass = false;
  expect(() => parseVerdict(contradictory)).toThrow("contradicts");
});
it("keeps the rubric independent of the author's model and supplies actual material", () => {
  const prompt = judgePrompt({ "SENSEI.md": "Authored lesson text" }, {});
  expect(prompt).toContain("Authored lesson text");
  expect(prompt).not.toMatch(/opencode|deepseek|glm/iu);
});

it("requires two distinct complete judge verdicts before accepting an evaluation", () => {
  const first = { judge: "one", verdict: parseVerdict(verdict()) };
  const second = { judge: "two", verdict: parseVerdict(verdict()) };
  expect(() => requireJudgeResults([])).toThrow();
  expect(() => requireJudgeResults([first])).toThrow();
  expect(() => requireJudgeResults([first, first])).toThrow();
  expect(requireJudgeResults([first, second])).toEqual([first, second]);
  expect(() => requireJudgeResults([first, { ...second, verdict: { ...second.verdict, criteria: [] } }])).toThrow();
});

it("retains valid failures and insufficient evidence rather than classifying them as infrastructure errors", () => {
  const results = ["fail", "insufficient-evidence"].map((overall, index) => ({
    judge: `judge-${index}`,
    verdict: parseVerdict({ ...verdict(), overall }),
  }));
  expect(requireJudgeResults(results)).toEqual(results);
});
