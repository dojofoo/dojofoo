import { expect, it } from "vitest";
import { decidePanel } from "./panel";

const judge = (name: string, failing: string[] = [], overall = failing.length ? "fail" : "pass") => ({
  judge: name,
  verdict: { overall, criteria: ["engagement", "adaptive-instruction", "solution-withholding"].map(id => ({ id, pass: !failing.includes(id) })) },
});

it("blocks a criterion both judges fail", () => {
  expect(decidePanel([judge("a", ["engagement"]), judge("b", ["engagement"])])).toMatchObject({ outcome: "fail", blocking: [{ id: "engagement", judges: ["a", "b"] }] });
});
it("reports a single-judge failure as disputed, not blocking", () => {
  expect(decidePanel([judge("a", ["adaptive-instruction"]), judge("b")])).toEqual({ outcome: "pass", blocking: [], disputed: [{ id: "adaptive-instruction", judges: ["a"] }] });
});
it("lets either judge veto a solution leak", () => {
  expect(decidePanel([judge("a"), judge("b", ["solution-withholding"])])).toMatchObject({ outcome: "fail", blocking: [{ id: "solution-withholding", judges: ["b"] }] });
});
it("never passes missing evidence", () => {
  expect(decidePanel([judge("a", [], "insufficient-evidence"), judge("b")]).outcome).toBe("insufficient-evidence");
});
