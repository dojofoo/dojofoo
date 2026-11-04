import { relative } from "node:path";
import type { SessionRecord } from "@dojofoo/agent-api";
import { readCourseManifest } from "@dojofoo/config";
import type { GuardViolation } from "@dojofoo/protocol";
import { clearCheckResult, solutionPath } from "../lesson/service";
import { addNotice, guardFor } from "./guard-store";
import { notifyPage } from "./notify";
import { dropHeld } from "./report-state";

/** Only a kata lesson's Sensei conversation has a solution file to guard (design, "Write guard": a no-op elsewhere). */
export function guardedLesson(root: string, record: Pick<SessionRecord, "persona" | "courseId" | "lessonId">): { courseId: string; lessonId: string } | undefined {
  if (record.persona !== "sensei" || !record.courseId || !record.lessonId) return undefined;
  try { if (readCourseManifest(root, record.courseId).mode === "interactive") return undefined; }
  catch { return undefined; }
  return { courseId: record.courseId, lessonId: record.lessonId };
}

/** Rule 1: before a delivery or a server turn. Returns the window's id only when this call opened it (a joined one is not
 *  this delivery's to discard, rule 2), and nothing for a session the guard does not cover. */
export async function openWindow(root: string, workspaceId: string, record: SessionRecord): Promise<string | undefined> {
  const lesson = guardedLesson(root, record);
  if (!lesson) return undefined;
  const guard = guardFor(root);
  if (await guard.find(record.id)) return undefined;
  const window = await guard.open(record.id, solutionPath(root, lesson.courseId, lesson.lessonId), {
    root, workspaceId, sessionId: record.id, courseId: lesson.courseId, lessonId: lesson.lessonId,
  });
  return window.id;
}

/** Rule 2: the delivery that opened the window was refused. */
export async function discardWindow(root: string, windowId: string | undefined): Promise<void> {
  if (windowId) await guardFor(root).discard(windowId);
}

/** Rule 3 for a verdict that acted: clear the lesson's check result, drop a held report, and tell the page, or keep a notice
 *  for the next time it opens (decision 19). */
export async function reportViolation(root: string, workspaceId: string, violation: GuardViolation): Promise<void> {
  clearCheckResult(root, violation.courseId, violation.lessonId);
  await dropHeld(root, workspaceId, violation.sessionId);
  const key = { workspaceId, courseId: violation.courseId, lessonId: violation.lessonId };
  if (!notifyPage(key, "guard.violation", violation)) await addNotice(root, { workspaceId, violation });
}

/** Closes the session's open window, if any (pause, settle, reconcile, a host stop, a replacement). */
export async function verifyWindow(root: string, workspaceId: string, sessionId: string, options: { turnId?: string; at?: "pause" } = {}): Promise<GuardViolation | undefined> {
  const guard = guardFor(root);
  const window = await guard.find(sessionId);
  if (!window) return undefined;
  const verdict = await guard.verify(window.id);
  if (!verdict) return undefined;
  if (verdict.action === "unchanged") {
    // Accepted residual: a parked native CLI could still write before the answer reopens a window
    if (options.at === "pause") console.info(`Guard window of ${sessionId} closed at its pause; a write before the answer is not checked.`);
    return undefined;
  }
  const violation: GuardViolation = {
    sessionId, ...(options.turnId ? { turnId: options.turnId } : {}), courseId: window.meta.courseId!, lessonId: window.meta.lessonId!,
    paths: [relative(root, window.path)], action: verdict.action, ...(verdict.quarantined ? { quarantined: verdict.quarantined } : {}),
    at: new Date().toISOString(),
  };
  console.warn(`The lesson file changed while Sensei was working (${violation.action} ${violation.paths.join(", ")}); the other version is at ${violation.quarantined ?? "nowhere"}.`);
  await reportViolation(root, workspaceId, violation);
  return violation;
}

/** The windows of these sessions, verified (a host stop, a reconcile); errors are logged. */
export async function verifyRecords(root: string, workspaceId: string, records: SessionRecord[]): Promise<void> {
  for (const record of records) {
    if (!guardedLesson(root, record)) continue;
    await verifyWindow(root, workspaceId, record.id).catch(error =>
      console.warn(`Could not verify the guard window of ${record.id}: ${error instanceof Error ? error.message : String(error)}`));
  }
}
