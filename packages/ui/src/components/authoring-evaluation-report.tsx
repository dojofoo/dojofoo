import type { EvaluationReport } from "@dojofoo/authoring/evaluation/run";

const statuses: Record<EvaluationReport["status"], string> = {
  running: "Evaluation running",
  passed: "Tested scenarios passed",
  "material-failed": "Material needs revision",
  "teaching-failed": "Teaching needs revision",
  "infrastructure-failed": "Evaluation could not finish",
  stale: "Evaluation report is out of date",
};

export function AuthoringEvaluationReport({ report }: { report: EvaluationReport }) {
  return <section aria-label="Teaching evaluation report" className="max-h-72 overflow-auto border-b border-dashed p-4 text-sm">
    <h2 className="font-sans font-semibold">{statuses[report.status]}</h2>
    <p className="text-muted-foreground">{report.lessonIds.at(-1)} · {report.stage}</p>
    {report.lessonIds.length > 1 ? <p className="text-xs text-muted-foreground">Completed before this trial: {report.lessonIds.slice(0, -1).join(" · ")}. These lessons were not re-evaluated.</p> : null}
    {report.error ? <p role="alert" className="mt-2 text-destructive">{report.error}</p> : null}
    {(["material", "teaching"] as const).map(stage => report[stage]?.map(result => <details className="mt-3" key={`${stage}-${result.judge}`} open={result.verdict.overall !== "pass"}>
      <summary className="cursor-pointer font-medium">{stage === "material" ? "Material" : "Teaching"} · {result.judge} · {result.verdict.overall}</summary>
      <ul className="ml-5 list-disc space-y-2 pt-2">
        {result.verdict.criteria.map(criterion => <li key={criterion.id}>
          <span className="font-medium">{criterion.id}: {criterion.pass ? "pass" : report.decisions?.[stage]?.disputed.some(({ id }) => id === criterion.id) ? "disputed (one judge)" : "revise"}</span>
          <p>{criterion.evidence}</p>
          {criterion.improvement ? <p>{criterion.improvement}</p> : null}
        </li>)}
      </ul>
      <p className="mt-2 text-muted-foreground">{result.verdict.limitation}</p>
    </details>))}
    <p className="mt-3 text-xs text-muted-foreground">Simulation evidence, not a guarantee of learning outcomes.</p>
  </section>;
}
