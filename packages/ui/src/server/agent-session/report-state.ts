import type { CheckReportState } from "@dojofoo/protocol";
import { readRecords } from "./records";
import { applyLifecycle } from "./lifecycle";
import { notifyPage, pageKeyOf } from "./notify";

/** The check card's label for an observation (socket `lesson.check.report`). */
export function notifyReport(workspaceId: string, record: { courseId?: string; lessonId?: string }, observationId: string, state: CheckReportState): void {
  const key = pageKeyOf(workspaceId, record);
  if (key) notifyPage(key, "lesson.check.report", { observationId, state });
}

/** Drops a session's held report (D16), and tells its card. Returns the dropped observation. */
export async function dropHeld(path: string, workspaceId: string, sessionId: string): Promise<string | undefined> {
  const before = (await readRecords(path)).find(record => record.id === sessionId);
  const held = before?.lifecycle?.heldReport;
  if (!held) return undefined;
  await applyLifecycle(path, sessionId, { type: "report-dropped" });
  notifyReport(workspaceId, before, held.observationId, "dropped");
  return held.observationId;
}
