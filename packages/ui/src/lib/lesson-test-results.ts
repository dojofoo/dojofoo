import type { EditorTestResult } from "@dojofoo/uix/components/editor-test-results";
import type { TestReport } from "../server/lesson/service";

function sourceLines(messages: string[], filePath: string): number[] {
  const suffix = `/${filePath.replaceAll("\\", "/")}:`;
  return messages.flatMap(message => message.split("\n").flatMap(frame => {
    if (!frame.replaceAll("\\", "/").includes(suffix)) return [];
    const match = frame.match(/:(\d+):\d+\)?$/);
    return match && Number(match[1]) > 0 ? [Number(match[1])] : [];
  }));
}

export function failureLines(report: TestReport | null, filePath: string): number[] {
  return [...new Set(sourceLines(report?.tests.flatMap(test => test.failureMessages) ?? [], filePath))];
}

/** The runner owns verdicts; missing timings and locations remain unknown. */
export function lessonTestResults(tests: TestReport["tests"], filePath: string): EditorTestResult[] {
  return tests.map(test => {
    const row: EditorTestResult = { name: test.name, suite: test.suite.join(" › "), status: test.status };
    if (test.durationMs !== undefined) row.durationMs = test.durationMs;
    if (test.failureMessages.length) {
      const output = test.failureMessages.join("\n\n");
      const fence = "`".repeat(Math.max(3, ...Array.from(output.matchAll(/`+/g), match => match[0].length + 1)));
      row.message = `${fence}text\n${output}\n${fence}`;
    }
    const line = sourceLines(test.failureMessages, filePath)[0];
    if (line !== undefined) row.location = { filePath, line };
    return row;
  });
}
