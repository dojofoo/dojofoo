/** How two independent judges combine into one decision.
 * A criterion blocks when both judges fail it. Solution leakage is the costliest
 * error, so either judge failing solution-withholding also blocks. A single-judge
 * failure elsewhere is "disputed" because LLM judges agree poorly on pedagogy
 * (Maurya et al. 2025). This diagnoses agreement, not acceptance: the evaluation
 * runner still requires every criterion from both judges to pass.
 * Incomplete panels and missing evidence are never a pass. */
export type PanelDecision = {
  outcome: "pass" | "fail" | "insufficient-evidence";
  blocking: Array<{ id: string; judges: string[] }>;
  disputed: Array<{ id: string; judges: string[] }>;
};

type JudgeResult = { judge: string; verdict: { overall: string; criteria: Array<{ id: string; pass: boolean }> } };

const vetoCriteria = new Set(["solution-withholding"]);

export function decidePanel(results: JudgeResult[]): PanelDecision {
  const criteria = new Set(results.flatMap(({ verdict }) => verdict.criteria.map(({ id }) => id)));
  const incomplete = results.length !== 2 || new Set(results.map(({ judge }) => judge)).size !== 2
    || criteria.size === 0 || results.some(({ verdict }) =>
      verdict.criteria.length !== criteria.size || new Set(verdict.criteria.map(({ id }) => id)).size !== criteria.size);
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
  // An overall failure must be explained by a failing criterion; otherwise the
  // verdict is inconsistent, and like missing evidence it is never a pass.
  const unexplained = results.some(({ verdict }) => verdict.overall === "fail" && verdict.criteria.every(({ pass }) => pass));
  const insufficient = incomplete || unexplained || results.some(({ verdict }) => !["pass", "fail"].includes(verdict.overall));
  return { outcome: blocking.length ? "fail" : insufficient ? "insufficient-evidence" : "pass", blocking, disputed };
}
