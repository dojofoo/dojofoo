import { expect, it } from "vitest";
import { evaluationSummary } from "./index";

it("shows a running evaluation as progress, not a stalled tool", () => {
  expect(evaluationSummary(undefined, true)?.label).toContain("a few minutes");
});
it("summarizes verdicts instead of dumping JSON", () => {
  const summary = evaluationSummary(JSON.stringify({
    status: "material-failed", remaining: 1,
    decisions: { material: { blocking: [{ id: "solution-withholding" }], disputed: [{ id: "engagement" }] } },
  }), false);
  expect(summary).toEqual({
    label: "Lesson material needs a revision · 1 attempt left",
    detail: "Revise: solution-withholding\nDisputed (one judge): engagement",
  });
});
it("explains preflight findings without spending an attempt", () => {
  expect(evaluationSummary({ status: "preflight-failed", error: "first:\n- Add the ## Teach section", next: "Fix these findings" }, false))
    .toMatchObject({ label: expect.stringContaining("no attempt used"), detail: expect.stringContaining("## Teach") });
});
