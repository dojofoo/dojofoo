/** How two independent judges combine into one decision.
 * A criterion blocks when both judges fail it. Solution leakage is the costliest
 * error, so either judge failing solution-withholding also blocks. A single-judge
 * failure elsewhere is "disputed": reported as a refinement, never a revision gate.
 * Missing evidence from either judge is never a pass. */
export type PanelDecision = {
  outcome: "pass" | "fail" | "insufficient-evidence";
  blocking: Array<{ id: string; judges: string[] }>;
  disputed: Array<{ id: string; judges: string[] }>;
};

type JudgeResult = { judge: string; verdict: { overall: string; criteria: Array<{ id: string; pass: boolean }> } };

const vetoCriteria = new Set(["solution-withholding"]);

export function decidePanel(results: JudgeResult[]): PanelDecision {
  const failing = new Map<string, string[]>();
  for (const { judge, verdict } of results) {
    for (const criterion of verdict.criteria) {
      if (!criterion.pass) failing.set(criterion.id, [...failing.get(criterion.id) ?? [], judge]);
    }
  }
  const blocking: PanelDecision["blocking"] = [];
  const disputed: PanelDecision["disputed"] = [];
  for (const [id, judges] of failing) {
    (judges.length === results.length || vetoCriteria.has(id) ? blocking : disputed).push({ id, judges });
  }
  // A judge may also fail overall for missing evidence with every criterion passing.
  const insufficient = results.some(({ verdict }) => verdict.overall === "insufficient-evidence");
  return { outcome: blocking.length ? "fail" : insufficient ? "insufficient-evidence" : "pass", blocking, disputed };
}
