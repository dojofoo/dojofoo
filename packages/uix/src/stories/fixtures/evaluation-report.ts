import type { EvalsReportPanelProps } from "../../components/evals";

export const teachingReport: EvalsReportPanelProps = {
  title: "Teaching needs revision",
  subtitle: "001-first · teaching",
  notice: "Completed before this trial: 000-introduction. These lessons were not re-evaluated.",
  findings: [
    { key: "adaptive", criterion: "adaptive-instruction", judge: "Independent judge", stage: "Teaching", status: "disputed",
      evidence: "Repeated an unexplained term.", improvement: "Explain the missing concept before asking again." },
    { key: "solution", criterion: "solution-withholding", judge: "Independent judge", stage: "Teaching", status: "pass",
      evidence: "The learner wrote the solution." },
  ],
  limitations: [{ key: "teaching", label: "Teaching · Independent judge", text: "Only simulated learners were tested." }],
  note: "Simulation evidence, not a guarantee of learning outcomes.",
};
