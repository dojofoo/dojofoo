import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LessonChecklist } from "./lesson-brief";

it("keeps readiness states and actionable findings without inventing a completion score", () => {
  const html = renderToStaticMarkup(<LessonChecklist checks={[
    { id: "intent", label: "Course intent", ready: true, findings: ["Resolved finding"] },
    { id: "scaffold", label: "Learner scaffold and checks", ready: false, findings: ["Add a revealing edge case."] },
  ]} />);
  expect(html).toContain('aria-label="Readiness"');
  expect(html).toContain('aria-label="Ready"');
  expect(html).toContain('aria-label="Needs attention"');
  expect(html).toContain("Course intent");
  expect(html).toContain("Add a revealing edge case.");
  expect(html).not.toContain("Resolved finding");
  expect(html).not.toContain("button");
  expect(html).not.toContain("% ready");
});

it("does not show an empty readiness section when no checks are available", () => {
  expect(renderToStaticMarkup(<LessonChecklist checks={[]} />)).toBe("");
});
