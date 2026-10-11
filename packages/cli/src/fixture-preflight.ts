import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { dojoDir, readCatalog, readDojoRc, resolveAllKatas } from "@dojofoo/config";
import type { LearnerFixture } from "@dojofoo/authoring/evaluation/learner-fixtures";
import { runTests, type TestRun } from "./runner";

/** Run the production test adapter without recording completion or checks in
 * lesson history. All temporary learner edits are restored before Sensei starts.
 */
export async function verifyLearnerFixtures(
  root: string,
  courseId: string,
  fixtures: Record<string, LearnerFixture>,
  lessonIds: string[],
  signal: AbortSignal,
) {
  const rc = readDojoRc(root);
  const catalog = readCatalog(root, courseId);
  const lessons = resolveAllKatas(root, rc, catalog);
  const reports: Array<{ lessonId: string; variant: "wrong" | "solved"; report: TestRun }> = [];
  const evidencePath = join(root, ".dojo", "fixture-preflight.json");
  await mkdir(dirname(evidencePath), { recursive: true });
  for (const lessonId of lessonIds) {
    signal.throwIfAborted();
    const lesson = lessons.find(entry => entry.name === lessonId);
    const fixture = fixtures[lessonId];
    if (!lesson || !fixture) throw new Error(`Missing learner fixture or lesson: ${lessonId}`);
    const original = existsSync(lesson.workspacePath) ? await readFile(lesson.workspacePath) : undefined;
    await mkdir(dirname(lesson.workspacePath), { recursive: true });
    try {
      for (const variant of ["wrong", "solved"] as const) {
        signal.throwIfAborted();
        await writeFile(lesson.workspacePath, fixture[variant]);
        const report = runTests(lesson, catalog, dojoDir(root, courseId), root);
        reports.push({ lessonId, variant, report });
        await writeFile(evidencePath, JSON.stringify(reports, null, 2));
        if (report.error || report.total === 0) {
          throw new Error(`Learner fixture preflight failed: ${lessonId}/${variant}: ${report.error ?? "No executable tests"}`);
        }
        if (variant === "wrong" && report.failed === 0) {
          throw new Error(`Learner fixture preflight failed: ${lessonId}/wrong must fail an authored test`);
        }
        if (variant === "solved" && (report.failed !== 0 || report.passed !== report.total)) {
          throw new Error(`Learner fixture preflight failed: ${lessonId}/solved must pass every authored test`);
        }
      }
    } finally {
      if (original === undefined) await unlink(lesson.workspacePath);
      else await writeFile(lesson.workspacePath, original);
    }
  }
  return reports;
}
