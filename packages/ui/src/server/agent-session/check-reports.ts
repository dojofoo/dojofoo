import { setTimeout as delay } from "node:timers/promises";
import type { AgentEndpoint, AgentRuntime, SessionRecord } from "@dojofoo/agent-api";
import { resolveAgent } from "@dojofoo/config/runtime";
import { dojoTags, tagged, type CheckReportState } from "@dojofoo/protocol";
import { senseiTurn } from "../lesson/instructions";
import { checkLesson, checkObservationInstruction, type CheckObservation } from "../lesson/service";
import { discardWindow, openWindow } from "./guard";
import { afterDelivery, applyLifecycle, beforeDelivery } from "./lifecycle";
import { readRecords } from "./records";
import { notifyPage } from "./notify";
import { dropHeld, notifyReport } from "./report-state";

export { dropHeld } from "./report-state";

/** `[dojo:check] Ran lesson checks.`, a blank line, and the check's JSON: its instruction, attempt, code change, diff and report. */
export function reportText(observation: CheckObservation): string {
  return `${tagged(dojoTags.check, senseiTurn("checks-ran"))}\n\n${JSON.stringify({
    instruction: checkObservationInstruction(observation), attempt: observation.attempt, codeChanged: observation.codeChanged,
    diff: observation.diff, report: observation.report,
  })}`;
}

/** A learner's or Sensei's Check of a lesson of any course (D30), with the lesson socket's notifications for its page. */
export async function runLessonCheck(target: { path: string; workspaceId: string }, courseId: string, lessonId: string) {
  const key = { workspaceId: target.workspaceId, courseId, lessonId };
  notifyPage(key, "lesson.check.started", { courseId, lessonId });
  // Let the started notification reach the browser before the local test process occupies this worker
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  const checked = await checkLesson(target.path, courseId, lessonId);
  for (const test of checked.observation.report.tests) notifyPage(key, "lesson.check.test", { test });
  notifyPage(key, "lesson.check.completed", checked);
  return checked;
}

/** A server turn (the begin turn, a check report): window first (rule 1), the pre-delivery transition, then the POST, retrying
 *  `409 session_not_ready` for 20 s as Eve's client does. A refusal discards the window it opened and restores the status.
 *  `resend` repeats an earlier delivery's key to a paused session, which Eve answers with the original receipt: nothing opens. */
export async function sendServerTurn(path: string, workspaceId: string, endpoint: AgentEndpoint, record: SessionRecord,
  turn: { text: string; idempotencyKey: string; turnPolicy?: "queue"; resend?: boolean }): Promise<string | undefined> {
  const opened = turn.resend ? undefined : await openWindow(path, workspaceId, record);
  const before = turn.resend ? undefined : await beforeDelivery(path, record.id);
  const refuse = async (status: number) => {
    if (turn.resend) return;
    await discardWindow(path, opened);
    await afterDelivery(path, record.id, before, status);
  };
  const deadline = Date.now() + 20_000;
  for (let wait = 250; ;) {
    let response: Response;
    try {
      response = await fetch(`${endpoint.baseUrl.replace(/\/$/u, "")}/eve/v1/session/${encodeURIComponent(record.id)}`, {
        method: "POST", headers: { ...endpoint.headers, "content-type": "application/json" },
        body: JSON.stringify({ message: turn.text, idempotencyKey: turn.idempotencyKey, ...(turn.turnPolicy ? { turnPolicy: turn.turnPolicy } : {}) }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      await refuse(502);
      throw error;
    }
    if (response.ok) {
      const answer = await response.json().catch(() => ({})) as { deliveryId?: unknown };
      return typeof answer.deliveryId === "string" ? answer.deliveryId : undefined;
    }
    const failure = await response.json().catch(() => ({})) as { code?: string; error?: string };
    if (response.status === 409 && failure.code === "session_not_ready" && Date.now() < deadline) {
      await delay(Math.min(wait, deadline - Date.now()));
      wait = Math.min(wait * 2, 2_000);
      continue;
    }
    await refuse(response.status);
    throw new Error(failure.error ?? `The server turn was refused (${response.status}).`);
  }
}

/** Sends a report now; a refusal drops it (the card says Sensei hasn't seen it). */
async function sendReport(path: string, workspaceId: string, endpoint: AgentEndpoint, record: SessionRecord, report: { observationId: string; text: string }): Promise<CheckReportState> {
  try {
    const deliveryId = await sendServerTurn(path, workspaceId, endpoint, record, {
      text: report.text, idempotencyKey: `check:${record.id}:${report.observationId}`, turnPolicy: "queue",
    });
    await applyLifecycle(path, record.id, { type: "report-sent", observationId: report.observationId, ...(deliveryId ? { deliveryId } : {}) });
    notifyReport(workspaceId, record, report.observationId, "sent");
    return "sent";
  } catch (error) {
    console.warn(`Could not send the check report to ${record.id}: ${error instanceof Error ? error.message : String(error)}`);
    await applyLifecycle(path, record.id, { type: "report-dropped" });
    notifyReport(workspaceId, record, report.observationId, "dropped");
    return "dropped";
  }
}

const ready = (record: SessionRecord) => (record.lifecycle?.status ?? "idle") === "idle" && !record.lifecycle?.beginPending;

/** After every learner Check (D16): the page key's newest usable conversation on the selected agent gets the report now when it
 *  is idle with no begin pending (decision 31), else keeps it as its held report, replacing an older one. */
export async function offerCheckReport(runtime: Pick<AgentRuntime, "connect">, target: { path: string; workspaceId: string },
  courseId: string, lessonId: string, observation: CheckObservation): Promise<CheckReportState> {
  const { path, workspaceId } = target;
  const agent = resolveAgent(path);
  const record = (await readRecords(path)).filter(item => item.persona === "sensei" && item.courseId === courseId && item.lessonId === lessonId
    && item.agent === agent && !item.endedAt && !item.replacedBy).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!record) {
    notifyReport(workspaceId, { courseId, lessonId }, observation.id, "dropped");
    return "dropped";
  }
  const report = { observationId: observation.id, text: reportText(observation) };
  if (ready(record)) return sendReport(path, workspaceId, await runtime.connect(workspaceId, { agent: record.agent, persona: "sensei" }), record, report);
  await applyLifecycle(path, record.id, { type: "report-held", ...report });
  notifyReport(workspaceId, record, observation.id, "held");
  return "held";
}

/** A held report goes out once its session is idle with no begin pending (after a settle's answer, a reconcile, a rejected delivery). */
export async function sendHeld(path: string, workspaceId: string, endpoint: AgentEndpoint, sessionId: string): Promise<CheckReportState | undefined> {
  const record = (await readRecords(path)).find(item => item.id === sessionId);
  const held = record?.lifecycle?.heldReport;
  if (!record || !held || !ready(record)) return undefined;
  if (record.endedAt || record.replacedBy) {
    await dropHeld(path, workspaceId, sessionId);
    return "dropped";
  }
  return sendReport(path, workspaceId, endpoint, record, held);
}

/** Sensei saw the report: its delivery was consumed, or a kata `context` read returned its check (D16). */
export async function markSeen(path: string, workspaceId: string, sessionId: string, seen: { deliveryId?: string; observationId?: string }): Promise<void> {
  const before = (await readRecords(path)).find(item => item.id === sessionId);
  if (!before) return;
  const after = await applyLifecycle(path, sessionId, { type: "report-seen", ...seen });
  if (!after || after === before || JSON.stringify(after.lifecycle) === JSON.stringify(before.lifecycle)) return;
  const observationId = before.lifecycle?.sentReport && after.lifecycle?.sentReport?.seenAt && !before.lifecycle.sentReport.seenAt
    ? before.lifecycle.sentReport.observationId : seen.observationId;
  if (observationId) notifyReport(workspaceId, before, observationId, "seen");
}
