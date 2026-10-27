import { EditorTestResults, type EditorTestResult } from "@dojofoo/uix/components/editor-test-results";
import { lessonTestResults } from "../lib/lesson-test-results";
import type { TestReport } from "../server/lesson/service";

export function LessonTestResults({ report, running, tests = [], filePath, onReveal }: {
  report?: TestReport | null;
  running: boolean;
  tests?: TestReport["tests"];
  filePath: string;
  onReveal: (location: NonNullable<EditorTestResult["location"]>) => void;
}) {
  const rows = lessonTestResults(running ? tests : report?.tests ?? [], filePath);
  const status = running ? (rows.length ? `${rows.length} ${rows.length === 1 ? "test" : "tests"} finished. Checks are still running…` : "Running lesson checks…")
    : report ? `${report.passed} of ${report.total} checks passed${report.failed ? `, ${report.failed} failed` : ""}${report.skipped ? `, ${report.skipped} skipped` : ""}.`
    : "Run the lesson checks to see test results.";
  return <section aria-label="Lesson checks" aria-busy={running} className="flex h-full min-h-0 flex-col">
    <p role="status" className={running || !rows.length ? "px-4 py-3 font-mono text-sm text-muted-foreground" : "sr-only"}>{status}</p>
    {rows.length > 0 && <div className="min-h-0 flex-1"><EditorTestResults tests={rows} onReveal={onReveal} /></div>}
  </section>;
}
