import type { EvaluationReport } from "@dojofoo/authoring/evaluation/run";
import { EvalsReportPanel, type EvalsFinding } from "@dojofoo/uix/components/evals";
import type { ReactNode } from "react";

const statuses: Record<EvaluationReport["status"], string> = {
  running: "Evaluation running",
  passed: "Tested scenarios passed",
  "material-failed": "Material needs revision",
  "teaching-failed": "Teaching needs revision",
  "infrastructure-failed": "Evaluation could not finish",
  stale: "Evaluation report is out of date",
};

export function AuthoringEvaluationReport({ report, actions }: { report: EvaluationReport; actions?: ReactNode }) {
  const findings: EvalsFinding[] = [];
  const limitations: Array<{ key: string; label: string; text: string }> = [];
  for (const stage of ["material", "teaching"] as const) {
    for (const [index, result] of (report[stage] ?? []).entries()) {
      const label = `${stage === "material" ? "Material" : "Teaching"} · ${result.judge}`;
      limitations.push({ key: `${stage}:${index}`, label, text: result.verdict.limitation });
      result.verdict.criteria.forEach((criterion, criterionIndex) => findings.push({
        key: `${stage}:${index}:${criterionIndex}`, criterion: criterion.id, judge: result.judge,
        stage: stage === "material" ? "Material" : "Teaching",
        status: criterion.pass ? "pass" : report.decisions?.[stage]?.disputed.some(({ id }) => id === criterion.id) ? "disputed" : "revise",
        evidence: criterion.evidence, improvement: criterion.improvement,
      }));
    }
  }
  return <EvalsReportPanel title={statuses[report.status]} subtitle={[report.lessonIds.at(-1), report.stage].filter(Boolean).join(" · ")}
    notice={report.lessonIds.length > 1 ? `Completed before this trial: ${report.lessonIds.slice(0, -1).join(" · ")}. These lessons were not re-evaluated.` : undefined}
    error={report.error} findings={findings} limitations={limitations} actions={actions} note="Simulation evidence, not a guarantee of learning outcomes." />;
}
