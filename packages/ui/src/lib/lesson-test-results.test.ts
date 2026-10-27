import { describe, expect, it } from "vitest";
import { lessonTestResults, failureLines } from "./lesson-test-results";
import type { TestReport } from "../server/lesson/service";

describe("lesson check presentation", () => {
  const tests: TestReport["tests"] = [
    { name: "adds tokens", suite: ["model", "tokens"], status: "failed", durationMs: 12.5,
      failureMessages: ["Expected 2, received 0\n    at tokenize (/workspace/src/tokenize.ts:7:4)", "Another assertion"] },
    { name: "optional vocabulary", suite: [], status: "skipped", failureMessages: [] },
  ];

  it("preserves actual statuses, nested suites, timing and every assertion", () => {
    const rows = lessonTestResults(tests, "src/tokenize.ts");
    expect(rows[0]).toMatchObject({ name: "adds tokens", suite: "model › tokens", status: "failed", durationMs: 12.5,
      location: { filePath: "src/tokenize.ts", line: 7 } });
    expect(rows[0].message).toContain(tests[0].failureMessages[0]);
    expect(rows[0].message).toContain("Another assertion");
    expect(rows[1]).toEqual({ name: "optional vocabulary", suite: "", status: "skipped" });
  });

  it("does not turn a runner/test-file frame into an editable solution location", () => {
    const other = [{ ...tests[0], failureMessages: [" at test (/workspace/test/tokenize.test.ts:8:1)"] }];
    expect(lessonTestResults(other, "src/tokenize.ts")[0].location).toBeUndefined();
    expect(failureLines({ tests: other } as TestReport, "src/tokenize.ts")).toEqual([]);
  });

  it("handles Windows paths, deduplicates valid source lines and fences literal output", () => {
    const failures = [{ ...tests[0], failureMessages: [
      " at tokenize (C:\\work\\src\\tokenize.ts:9:2)\n at tokenize (C:\\work\\src\\tokenize.ts:9:3)\n at invalid (/work/src/tokenize.ts:0:1)",
      "```\n<assertion> **literal**\n```",
    ] }];
    expect(failureLines({ tests: failures } as TestReport, "src/tokenize.ts")).toEqual([9]);
    expect(lessonTestResults(failures, "src/tokenize.ts")[0].message).toContain("````text\n");
    expect(failureLines(null, "src/tokenize.ts")).toEqual([]);
  });
});
