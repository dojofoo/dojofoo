import { describe, expect, it } from "vitest";
import { parseVitestJson } from "../src/runner";

describe("Vitest report normalization", () => {
  it("preserves test metadata and normalizes source line coverage", () => {
    const workspacePath = "/project/katas/001-basics/solution.ts";
    const report = parseVitestJson(JSON.stringify({
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTests: 0,
      numPendingTests: 1,
      startTime: 100,
      testResults: [{
        name: "/project/katas/001-basics/solution.test.ts",
        startTime: 110,
        endTime: 135,
        assertionResults: [
          { title: "returns a value", fullName: "basics > returns a value", ancestorTitles: ["basics"], status: "passed", duration: 7, failureMessages: [] },
          { title: "handles an edge", fullName: "basics > edge cases > handles an edge", ancestorTitles: ["basics", "edge cases"], status: "pending", failureMessages: [] },
        ],
      }],
      coverageMap: {
        [workspacePath]: {
          statementMap: {
            "0": { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
            "1": { start: { line: 3, column: 0 }, end: { line: 3, column: 10 } },
          },
          s: { "0": 1, "1": 0 },
          fnMap: {
            "0": {
              name: "example",
              decl: { start: { line: 2, column: 0 }, end: { line: 2, column: 7 } },
              loc: { start: { line: 2, column: 0 }, end: { line: 4, column: 1 } },
            },
          },
          f: { "0": 1 },
        },
      },
    }), workspacePath);

    expect(report).toMatchObject({
      total: 2,
      passed: 1,
      failed: 0,
      skipped: 1,
      durationMs: 35,
      tests: [
        { name: "returns a value", suite: ["basics"], filePath: "/project/katas/001-basics/solution.test.ts", status: "passed", durationMs: 7 },
        { name: "handles an edge", suite: ["basics", "edge cases"], filePath: "/project/katas/001-basics/solution.test.ts", status: "skipped" },
      ],
      coverage: {
        lines: { covered: 1, total: 2, percentage: 50 },
        lineHits: { "2": 1, "3": 1, "4": 1 },
      },
    });
  });
});
