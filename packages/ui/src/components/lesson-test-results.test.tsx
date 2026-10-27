import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LessonTestResults } from "./lesson-test-results";
import type { TestReport } from "../server/lesson/service";

describe("production lesson results", () => {
  const report: TestReport = { passed: 1, failed: 0, skipped: 1, total: 2, complete: false, tests: [
    { name: "token count", suite: ["vocabulary"], status: "passed", durationMs: 4.123456789, failureMessages: [] },
    { name: "optional case", suite: [], status: "skipped", failureMessages: [] },
  ] };
  const render = (props: Partial<Parameters<typeof LessonTestResults>[0]> = {}) => renderToStaticMarkup(
    <LessonTestResults running={false} filePath="tokenize.ts" onReveal={() => {}} {...props} />,
  );

  it("renders the shared clean table with actual pass/skip status and no collapsibles", () => {
    const html = render({ report });
    expect(html).toContain('class="ui-dtc ui-ed-results');
    expect(html).toContain('aria-label="Passed"');
    expect(html).toContain('aria-label="Skipped"');
    expect(html).toContain("4.12 ms");
    expect(html).not.toContain("4.123456789");
    expect(html).toContain("1 of 2 checks passed, 1 skipped.");
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain('role="checkbox"');
  });

  it("keeps running checks busy even after some test results arrive", () => {
    const html = render({ report, running: true, tests: [report.tests[1]] });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("1 test finished. Checks are still running…");
    expect(html).toContain("optional case");
    expect(html).not.toContain("token count");
    expect(html).not.toContain("1 of 2 checks passed");
  });

  it("distinguishes not-run, running and aggregate-only results without inventing rows", () => {
    expect(render()).toContain("Run the lesson checks");
    const running = render({ running: true });
    expect(running).toContain("Running lesson checks…");
    expect(running).not.toContain("<table");
    const aggregate = render({ report: { ...report, tests: [] } });
    expect(aggregate).toContain("1 of 2 checks passed, 1 skipped.");
    expect(aggregate).not.toContain("<table");
  });
});
