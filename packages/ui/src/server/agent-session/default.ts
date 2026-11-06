import { createRequire } from "node:module";
import { Client, ClientError } from "@dojofoo/harness/client";
import { AgentApiError, type AgentEndpoint, type DefaultSessionRequest, type DefaultSessionResponse, type Persona, type SessionRecord } from "@dojofoo/harness/api";
import { readAgentModel } from "@dojofoo/config/runtime";
import { dojoTags, tagged, type AgentId, type LearnerEvidenceExcerpt } from "@dojofoo/protocol";
import { senseiTurn } from "../lesson/instructions";
import { sendServerTurn } from "./check-reports";
import { learnerEvidence } from "./evidence";
import { verifyWindow } from "./guard";
import { readRecords, saveRecord, updateRecord } from "./records";

export interface DefaultSessionDeps {
  /** The workspace's folder; 404 workspace_not_found */
  root(workspaceId: string): string;
  persona(workspaceId: string): Promise<Persona>;
  /** The workspace's selected coding agent */
  selected(path: string): AgentId;
  /** The persona's host of the selected agent, applying the offer checks */
  connect(workspaceId: string, target: { agent: string; persona: Persona }): Promise<AgentEndpoint>;
}

type Unusable = "ended" | "replaced" | "resume-failed" | "unreadable";
/** `[dojo:begin] Begin the lesson.`, then TURNS.md's evidence-seed and the learner's excerpts when the page key has some */
const beginMessage = (evidence: LearnerEvidenceExcerpt[]) => `${tagged(dojoTags.begin, senseiTurn("begin"))}${evidence.length
  ? `\n\n${senseiTurn("evidence-seed")}\n${evidence.map(entry => `${entry.role === "user" ? "Learner" : "Sensei"}: ${entry.text}`).join("\n")}` : ""}`;
/** A create whose begin turn failed; its record is saved and must be replaced */
class BeginFailed extends Error {
  constructor(readonly record: SessionRecord, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}
const unreadable = (status: number, code?: string) => status === 404 || status === 410 || (status === 409 && code === "session_stranded");

/** POST /sessions/default (D29): the page's default conversation, one per page key, got or created under one lock per key.
 *  The lock holds only while one UI server runs per DOJOFOO_HOME; step 5 adds the server lock. */
export function createDefaultSessions(deps: DefaultSessionDeps) {
  const locks = new Map<string, Promise<unknown>>();
  const locked = <T>(key: string, run: () => Promise<T>): Promise<T> => {
    const next = (locks.get(key) ?? Promise.resolve()).catch(() => {}).then(run);
    locks.set(key, next);
    void next.finally(() => { if (locks.get(key) === next) locks.delete(key); }).catch(() => {});
    return next;
  };

  /** Whether Eve can still continue this conversation; a failed read or an ended session is written down, so the next lookup needs none.
   *  Only an unreadable one is `unavailable`: a conversation that ended in Eve stays readable (an ended Kyoshi one opens read-only, D32). */
  async function usable(path: string, endpoint: AgentEndpoint, record: SessionRecord): Promise<Unusable | undefined> {
    if (record.endedAt) return "ended";
    if (record.replacedBy) return "replaced";
    if (record.lifecycle?.resumeFailedAt) return "resume-failed";
    let reason: string | undefined;
    try {
      // One bounded read; Eve's client retries a 404 stream, so its status is read here first
      const probe = await fetch(`${endpoint.baseUrl.replace(/\/$/u, "")}/eve/v1/session/${encodeURIComponent(record.id)}/stream?follow=false`,
        { headers: endpoint.headers, signal: AbortSignal.timeout(2_000) });
      const body = probe.ok ? undefined : await probe.json().catch(() => undefined) as { code?: string } | undefined;
      void probe.body?.cancel().catch(() => {});
      if (unreadable(probe.status, body?.code)) reason = `${probe.status} ${body?.code ?? ""}`.trim();
      else if (probe.ok) {
        const { events } = await new Client(endpoint).sessions.attach(record.id).snapshot({ signal: AbortSignal.timeout(2_000) });
        if (events.some(event => event.type === "session.ended")) reason = "session.ended";
      }
    } catch (error) {
      if (error instanceof ClientError && unreadable(error.status, error.code)) reason = `${error.status} ${error.code}`;
      // Anything else (a slow host) does not prove the conversation is gone
    }
    if (!reason) return undefined;
    const lost = reason !== "session.ended";
    console.info(`${record.persona === "kyoshi" ? "Kyoshi" : "Sensei"} conversation ${record.id} can't continue (${reason}); opening a new one.`);
    await updateRecord(path, record.id, current => ({ ...current, endedAt: current.endedAt ?? new Date().toISOString(), ...(lost ? { unavailable: true as const } : {}) }))
      .catch(() => {});
    return lost ? "unreadable" : "ended";
  }

  async function endEve(endpoint: AgentEndpoint, record: SessionRecord) {
    if (record.endedAt) return;
    await new Client(endpoint).sessions.attach(record.id).end({ signal: AbortSignal.timeout(5_000) }).catch(() => {});
  }

  /** The begin turn (`begin:<id>:<attempt>`), sent through the server-turn path (window, pre-delivery, POST); `beginPending` names it.
   *  A resend with the same key to a paused begin opens nothing: Eve answers it with the original receipt. */
  async function sendBegin(path: string, workspaceId: string, endpoint: AgentEndpoint, record: SessionRecord, begin: { attempt: number; message: string }) {
    const idempotencyKey = `begin:${record.id}:${begin.attempt}`;
    const resend = record.lifecycle?.beginPending?.idempotencyKey === idempotencyKey && record.lifecycle.status === "paused";
    const updated = await updateRecord(path, record.id, current => ({ ...current, lifecycle: {
      ...current.lifecycle ?? { status: "idle" as const, updatedAt: new Date().toISOString() },
      beginPending: { idempotencyKey, sentAt: new Date().toISOString(), attempt: begin.attempt }, updatedAt: new Date().toISOString(),
    } }));
    await sendServerTurn(path, workspaceId, endpoint, updated, { text: begin.message, idempotencyKey, resend });
  }

  /** Kyoshi's: a bodyless Eve create, the record, then the hidden start turn (decision 1). Kyoshi has no begin contract to retry, so a
   *  failed start turn is logged and the conversation returned as it is: the author's first message starts it. */
  async function createKyoshi(path: string, workspaceId: string, endpoint: AgentEndpoint, agent: AgentId): Promise<SessionRecord> {
    const { session } = await new Client(endpoint).sessions.create({ signal: AbortSignal.timeout(20_000) });
    const now = new Date().toISOString();
    const record: SessionRecord = { id: session.id, agent, persona: "kyoshi", createdAt: now, revision: 0, lifecycle: { status: "idle", updatedAt: now } };
    await saveRecord(path, record);
    await sendServerTurn(path, workspaceId, endpoint, record, { text: dojoTags.beginAuthoring, idempotencyKey: `begin-authoring:${record.id}` }).catch(error =>
      console.warn(`Could not send Kyoshi's start turn to ${record.id}: ${error instanceof Error ? error.message : String(error)}`));
    return (await readRecords(path)).find(item => item.id === record.id) ?? record;
  }

  /** A bodyless Eve create, the record, then the hidden begin turn, seeded from the learner's evidence for this page key */
  async function create(path: string, workspaceId: string, endpoint: AgentEndpoint, agent: AgentId, request: DefaultSessionRequest): Promise<SessionRecord> {
    if (request.course === undefined) return createKyoshi(path, workspaceId, endpoint, agent);
    const { session } = await new Client(endpoint).sessions.create({ signal: AbortSignal.timeout(20_000) });
    const model = readAgentModel(path, agent) ?? await (createRequire(import.meta.url)("@dojofoo/agents/eve/models") as typeof import("@dojofoo/agents/eve/models"))
      .configuredHarnessModel(agent).catch(() => undefined);
    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: session.id, agent, persona: "sensei", createdAt: now, courseId: request.course, ...(request.lesson ? { lessonId: request.lesson } : {}),
      ...(model ? { model } : {}), revision: 0, lifecycle: { status: "idle", updatedAt: now },
    };
    await saveRecord(path, record);
    try { await sendBegin(path, workspaceId, endpoint, record, { attempt: 0, message: beginMessage(await learnerEvidence(path, request.course, request.lesson)) }); }
    catch (error) { throw new BeginFailed(record, error); }
    return (await readRecords(path)).find(item => item.id === record.id) ?? record;
  }

  /** Create; a failed begin replaces that session once inside the same request, and a second failure answers 503 agent_failed */
  async function createWithRetry(path: string, workspaceId: string, endpoint: AgentEndpoint, agent: AgentId, request: DefaultSessionRequest): Promise<SessionRecord> {
    let failed: SessionRecord | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        const created = await create(path, workspaceId, endpoint, agent, request);
        if (failed) await updateRecord(path, failed.id, current => ({ ...current, replacedBy: created.id })).catch(() => {});
        return created;
      } catch (error) {
        if (error instanceof BeginFailed) {
          failed = error.record;
          await endEve(endpoint, failed);
          await updateRecord(path, failed.id, current => ({ ...current, endedAt: current.endedAt ?? new Date().toISOString() })).catch(() => {});
        }
        if (attempt === 1 || !(error instanceof BeginFailed)) {
          throw new AgentApiError(503, "agent_failed", `${request.course === undefined ? "Kyoshi" : "Sensei"} could not start the conversation: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  /** The Replacement rule: verify the old session's window, end it in Eve if it has not ended, create, record replacedBy on the old one */
  async function replace(path: string, workspaceId: string, endpoint: AgentEndpoint, agent: AgentId, request: DefaultSessionRequest, old: SessionRecord) {
    await verifyWindow(path, workspaceId, old.id);
    await endEve(endpoint, old);
    const created = await createWithRetry(path, workspaceId, endpoint, agent, request);
    await updateRecord(path, old.id, current => ({ ...current, replacedBy: created.id })).catch(() => {});
    return created;
  }

  /** A record whose begin is still pending (a crash before it settled) gets it resent with the same key, which Eve answers with the
   *  original receipt; a begin a leave cancelled is resent as a new turn with the next attempt's key (D29) */
  async function resumeBegin(path: string, workspaceId: string, endpoint: AgentEndpoint, record: SessionRecord) {
    const pending = record.lifecycle?.beginPending;
    if (!pending) return record;
    const attempt = (pending.attempt ?? 0) + (pending.cancelledAt ? 1 : 0);
    await sendBegin(path, workspaceId, endpoint, record, { attempt, message: beginMessage(await learnerEvidence(path, record.courseId!, record.lessonId)) }).catch(error =>
      console.warn(`Could not resend the begin turn of ${record.id}: ${error instanceof Error ? error.message : String(error)}`));
    return (await readRecords(path)).find(item => item.id === record.id) ?? record;
  }

  return async function openDefault(workspaceId: string, request: DefaultSessionRequest): Promise<DefaultSessionResponse> {
    const path = deps.root(workspaceId);
    // A draft's page key is (draft, Kyoshi); a Sensei page's is its course and lesson
    const persona = await deps.persona(workspaceId);
    if (persona === "kyoshi" ? request.course !== undefined || request.lesson !== undefined : request.course === undefined) {
      throw new AgentApiError(400, "invalid_request", persona === "kyoshi" ? "A draft's conversation names no course or lesson." : "A Sensei page names its course.");
    }
    const agent = deps.selected(path);
    const lesson = request.lesson ?? "";
    return locked(persona === "kyoshi" ? `${path}\0kyoshi` : `${path}\0sensei\0${request.course}\0${lesson}`, async () => {
      const endpoint = await deps.connect(workspaceId, { agent, persona });
      const records = await readRecords(path);
      const forPage = (record: SessionRecord) => record.persona === persona
        && (persona === "kyoshi" || (record.courseId === request.course && (record.lessonId ?? "") === lesson));
      const answer = async (record: SessionRecord, notice?: "picked-unavailable"): Promise<DefaultSessionResponse> => ({
        session: await resumeBegin(path, workspaceId, endpoint, record), rewrite: record.id !== request.session, ...(notice ? { notice } : {}),
      });
      if (request.new) {
        const from = request.from ? records.find(record => record.id === request.from) : undefined;
        // A second tab asking to replace the same conversation gets the same replacement (D28)
        if (from?.replacedBy) {
          const replacement = (await readRecords(path)).find(record => record.id === from.replacedBy);
          if (replacement) return { session: await resumeBegin(path, workspaceId, endpoint, replacement), rewrite: true };
        }
        const created = from ? await replace(path, workspaceId, endpoint, agent, request, from) : await createWithRetry(path, workspaceId, endpoint, agent, request);
        return { session: created, rewrite: true };
      }
      let notice: "picked-unavailable" | undefined;
      // Only a requested record of this page on the selected agent that can't continue gets the notice; another agent's conversation
      // can still continue after a switch (decision 19)
      const picked = request.session ? records.find(record => record.id === request.session) : undefined;
      if (picked && forPage(picked) && picked.agent === agent) {
        if (!await usable(path, endpoint, picked)) return answer(picked);
        notice = "picked-unavailable";
      }
      const newest = (await readRecords(path)).filter(record => forPage(record) && record.agent === agent)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      if (!newest) return { session: await createWithRetry(path, workspaceId, endpoint, agent, request), rewrite: true, ...(notice ? { notice } : {}) };
      if (!await usable(path, endpoint, newest)) return answer(newest, notice);
      const replaced = await replace(path, workspaceId, endpoint, agent, request, (await readRecords(path)).find(record => record.id === newest.id) ?? newest);
      return { session: replaced, rewrite: true, ...(notice ? { notice } : {}) };
    });
  };
}
