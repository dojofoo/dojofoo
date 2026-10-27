import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { EvaluationReport } from "@dojofoo/authoring/evaluation/run";
import { AuthoringEvaluationReport } from "./authoring-evaluation-report";

const report: EvaluationReport = {
  version: 1, directory: "/evidence", materialHash: "hash", lessonIds: ["001-first"],
  status: "teaching-failed", stage: "teaching", startedAt: "start", completedAt: "end",
  teaching: [{ judge: "Independent judge", root: "/judge", promptHash: "hash", verdict: {
    overall: "fail", limitation: "Only simulated learners were tested.", criteria: [
      { id: "adaptive-instruction", pass: false, evidence: "Repeated an unexplained term.", improvement: "Explain the missing concept before asking again." },
    ],
  } }],
};

it("shows actionable teaching findings rather than hiding them in a score", () => {
  const html = renderToStaticMarkup(<AuthoringEvaluationReport report={report} />);
  expect(html).toContain("Teaching needs revision");
  expect(html).toContain("Repeated an unexplained term.");
  expect(html).toContain("Explain the missing concept before asking again.");
  expect(html).toContain("<table");
  expect(html).not.toContain("<details");
  expect(html).toContain("not a guarantee of learning outcomes");
});

it("keeps single-judge disputes and prior-lesson coverage separate from passing evidence", () => {
  const html = renderToStaticMarkup(<AuthoringEvaluationReport report={{ ...report,
    lessonIds: ["000-introduction", "001-first"],
    decisions: { teaching: { outcome: "pass", blocking: [], disputed: [{ id: "adaptive-instruction", judges: ["Independent judge"] }] } },
  }} />);
  expect(html).toContain("disputed (one judge)");
  expect(html).toContain("Completed before this trial: 000-introduction. These lessons were not re-evaluated.");
  expect(html).toContain("Only simulated learners were tested.");
  expect(html).not.toContain("Tested scenarios passed");
  expect(html).not.toContain("TC-10");
  expect(html).not.toContain("Cost per 1k runs");
});

it("distinguishes a provider failure from poor teaching", () => {
  const html = renderToStaticMarkup(<AuthoringEvaluationReport report={{ ...report, status: "infrastructure-failed", teaching: undefined, error: "Provider unavailable" }} />);
  expect(html).toContain("Evaluation could not finish");
  expect(html).toContain('role="alert"');
  expect(html).toContain("Provider unavailable");
  expect(html).not.toContain("Teaching needs revision");
});

it("does not label an outdated passing report as a current pass", () => {
  const html = renderToStaticMarkup(<AuthoringEvaluationReport report={{ ...report, status: "stale", teaching: undefined }} />);
  expect(html).toContain("report is out of date");
  expect(html).not.toContain("Tested scenarios passed");
});
