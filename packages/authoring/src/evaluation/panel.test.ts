import { expect, it } from "vitest";
import { decidePanel } from "./panel";

const judge = (name: string, failing: string[] = [], overall = failing.length ? "fail" : "pass") => ({
  judge: name,
  verdict: { overall, criteria: ["engagement", "adaptive-instruction", "solution-withholding"].map(id => ({ id, pass: !failing.includes(id) })) },
});

it("blocks a criterion both judges fail", () => {
  expect(decidePanel([judge("a", ["engagement"]), judge("b", ["engagement"])])).toMatchObject({ outcome: "fail", blocking: [{ id: "engagement", judges: ["a", "b"] }] });
});
it("reports a single-judge failure as disputed without blocking", () => {
  expect(decidePanel([judge("a", ["adaptive-instruction"]), judge("b")])).toEqual({ outcome: "pass", blocking: [], disputed: [{ id: "adaptive-instruction", judges: ["a"] }] });
});
it("lets either judge veto a solution leak", () => {
  expect(decidePanel([judge("a"), judge("b", ["solution-withholding"])])).toMatchObject({ outcome: "fail", blocking: [{ id: "solution-withholding", judges: ["b"] }] });
});
it("never passes missing evidence", () => {
  expect(decidePanel([judge("a", [], "insufficient-evidence"), judge("b")]).outcome).toBe("insufficient-evidence");
});
it.each([[], [judge("a")], [judge("a"), judge("a")]])("requires two distinct judges: %j", (...results) => {
  expect(decidePanel(results).outcome).toBe("insufficient-evidence");
});
it("requires both judges to cover the same nonempty criteria", () => {
  const incomplete = judge("b");
  incomplete.verdict.criteria.pop();
  expect(decidePanel([judge("a"), incomplete]).outcome).toBe("insufficient-evidence");
  expect(decidePanel([judge("a"), judge("b")].map(j => ({ ...j, verdict: { ...j.verdict, criteria: [] } }))).outcome).toBe("insufficient-evidence");
});
it("never passes an overall failure no criterion explains", () => {
  expect(decidePanel([judge("a", [], "fail"), judge("b")]).outcome).toBe("insufficient-evidence");
});
it("passes when both judges pass", () => {
  expect(decidePanel([judge("a"), judge("b")]).outcome).toBe("pass");
});
