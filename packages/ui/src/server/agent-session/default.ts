import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { Client, ClientError } from "@dojofoo/agent/client";
import { AgentApiError, type AgentEndpoint, type DefaultSessionRequest, type DefaultSessionResponse, type Persona, type SessionRecord } from "@dojofoo/agent-api";
import { readAgentModel } from "@dojofoo/config/runtime";
import { dojoTags, tagged, type AgentId, type LearnerEvidenceExcerpt } from "@dojofoo/protocol";
import { senseiTurn } from "../lesson/instructions";
import { learnerEvidence } from "./evidence";
import { readRecords, saveRecord, updateRecord } from "./records";

export interface DefaultSessionDeps {
  /** The workspace's folder; 404 workspace_not_found */
  root(workspaceId: string): string;
  persona(workspaceId: string): Promise<Persona>;
  /** The workspace's selected coding agent */
  selected(path: string): AgentId;
  /** The Sensei host of the selected agent, applying the Cursor gate and the offer checks */
  connect(workspaceId: string, target: { agent: string; persona: Persona }): Promise<AgentEndpoint>;
  /** Interactive Sensei refuses Cursor until a passing Sensei record exists (decision 19) */
  refuses(agent: string): string | undefined;
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

  /** Whether Eve can still continue this conversation; a failed read or an ended session is written down, so the next lookup needs none */
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
    console.info(`Sensei conversation ${record.id} can't continue (${reason}); opening a new one.`);
    await updateRecord(path, record.id, current => ({ ...current, endedAt: current.endedAt ?? new Date().toISOString() })).catch(() => {});
    return "unreadable";
  }

  async function endEve(endpoint: AgentEndpoint, record: SessionRecord) {
    if (record.endedAt) return;
    await new Client(endpoint).sessions.attach(record.id).end({ signal: AbortSignal.timeout(5_000) }).catch(() => {});
  }

  /** The begin turn as a plain POST, because Eve's client takes no idempotency key; retries 409 session_not_ready for 20 s, as Eve's client does */
  async function sendBegin(path: string, endpoint: AgentEndpoint, record: SessionRecord, begin: { idempotencyKey: string; message: string }) {
    await updateRecord(path, record.id, current => ({ ...current, lifecycle: {
      ...current.lifecycle ?? { status: "idle" as const, updatedAt: new Date().toISOString() },
      beginPending: { idempotencyKey: begin.idempotencyKey, sentAt: new Date().toISOString() },
      status: current.lifecycle?.status === "paused" ? "paused" : "working", updatedAt: new Date().toISOString(),
    } }));
    const deadline = Date.now() + 20_000;
    for (let wait = 250; ;) {
      const response = await fetch(`${endpoint.baseUrl.replace(/\/$/u, "")}/eve/v1/session/${encodeURIComponent(record.id)}`, {
        method: "POST", headers: { ...endpoint.headers, "content-type": "application/json" },
        body: JSON.stringify({ message: begin.message, idempotencyKey: begin.idempotencyKey }), signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) { void response.body?.cancel().catch(() => {}); return; }
      const failure = await response.json().catch(() => ({})) as { code?: string; error?: string };
      if (response.status === 409 && failure.code === "session_not_ready" && Date.now() < deadline) {
        await delay(Math.min(wait, deadline - Date.now()));
        wait = Math.min(wait * 2, 2_000);
        continue;
      }
      throw new Error(failure.error ?? `The begin turn was refused (${response.status}).`);
    }
  }

  /** A bodyless Eve create, the record, then the hidden begin turn, seeded from the learner's evidence for this page key */
  async function create(path: string, endpoint: AgentEndpoint, agent: AgentId, request: DefaultSessionRequest): Promise<SessionRecord> {
    const { session } = await new Client(endpoint).sessions.create({ signal: AbortSignal.timeout(20_000) });
    const configured = agent === "codex" ? await (createRequire(import.meta.url)("@dojofoo/authoring/eve/models") as typeof import("@dojofoo/authoring/eve/models"))
      .configuredHarnessModel("codex").catch(() => undefined) : undefined;
    const model = readAgentModel(path, agent) ?? configured;
    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: session.id, agent, persona: "sensei", createdAt: now, courseId: request.course, ...(request.lesson ? { lessonId: request.lesson } : {}),
      ...(model ? { model } : {}), revision: 0, lifecycle: { status: "idle", updatedAt: now },
    };
    await saveRecord(path, record);
    try { await sendBegin(path, endpoint, record, { idempotencyKey: `begin:${record.id}:0`, message: beginMessage(await learnerEvidence(path, request.course, request.lesson)) }); }
    catch (error) { throw new BeginFailed(record, error); }
    return (await readRecords(path)).find(item => item.id === record.id) ?? record;
  }

  /** Create; a failed begin replaces that session once inside the same request, and a second failure answers 503 agent_failed */
  async function createWithRetry(path: string, endpoint: AgentEndpoint, agent: AgentId, request: DefaultSessionRequest): Promise<SessionRecord> {
    let failed: SessionRecord | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        const created = await create(path, endpoint, agent, request);
        if (failed) await updateRecord(path, failed.id, current => ({ ...current, replacedBy: created.id })).catch(() => {});
        return created;
      } catch (error) {
        if (error instanceof BeginFailed) {
          failed = error.record;
          await endEve(endpoint, failed);
          await updateRecord(path, failed.id, current => ({ ...current, endedAt: current.endedAt ?? new Date().toISOString() })).catch(() => {});
        }
        if (attempt === 1 || !(error instanceof BeginFailed)) {
          throw new AgentApiError(503, "agent_failed", `Sensei could not start the conversation: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  /** The Replacement rule: end the old Eve session if it has not ended, create, record replacedBy on the old one */
  async function replace(path: string, endpoint: AgentEndpoint, agent: AgentId, request: DefaultSessionRequest, old: SessionRecord) {
    await endEve(endpoint, old);
    const created = await createWithRetry(path, endpoint, agent, request);
    await updateRecord(path, old.id, current => ({ ...current, replacedBy: created.id })).catch(() => {});
    return created;
  }

  /** A record whose begin is still pending (a crash before it settled) gets it resent with the same key; Eve returns the original receipt */
  async function resumeBegin(path: string, endpoint: AgentEndpoint, record: SessionRecord) {
    const pending = record.lifecycle?.beginPending;
    if (!pending) return record;
    await sendBegin(path, endpoint, record, { idempotencyKey: pending.idempotencyKey, message: beginMessage(await learnerEvidence(path, record.courseId!, record.lessonId)) }).catch(error =>
      console.warn(`Could not resend the begin turn of ${record.id}: ${error instanceof Error ? error.message : String(error)}`));
    return (await readRecords(path)).find(item => item.id === record.id) ?? record;
  }

  return async function openDefault(workspaceId: string, request: DefaultSessionRequest): Promise<DefaultSessionResponse> {
    const path = deps.root(workspaceId);
    if (await deps.persona(workspaceId) !== "sensei") throw new AgentApiError(400, "invalid_request", "Drafts open their conversation with Kyoshi's own route.");
    const agent = deps.selected(path);
    const refusal = deps.refuses(agent);
    if (refusal) throw new AgentApiError(409, "agent_not_offered", refusal);
    const lesson = request.lesson ?? "";
    return locked(`${path}\0sensei\0${request.course}\0${lesson}`, async () => {
      const endpoint = await deps.connect(workspaceId, { agent, persona: "sensei" });
      const records = await readRecords(path);
      const forPage = (record: SessionRecord) => record.persona === "sensei" && record.courseId === request.course && (record.lessonId ?? "") === lesson;
      const answer = async (record: SessionRecord, notice?: "picked-unavailable"): Promise<DefaultSessionResponse> => ({
        session: await resumeBegin(path, endpoint, record), rewrite: record.id !== request.session, ...(notice ? { notice } : {}),
      });
      if (request.new) {
        const from = request.from ? records.find(record => record.id === request.from) : undefined;
        // A second tab asking to replace the same conversation gets the same replacement (D28)
        if (from?.replacedBy) {
          const replacement = (await readRecords(path)).find(record => record.id === from.replacedBy);
          if (replacement) return { session: await resumeBegin(path, endpoint, replacement), rewrite: true };
        }
        const created = from ? await replace(path, endpoint, agent, request, from) : await createWithRetry(path, endpoint, agent, request);
        return { session: created, rewrite: true };
      }
      let notice: "picked-unavailable" | undefined;
      if (request.session) {
        const picked = records.find(record => record.id === request.session);
        if (picked && forPage(picked) && picked.agent === agent && !await usable(path, endpoint, picked)) return answer(picked);
        if (picked) notice = "picked-unavailable";
      }
      const newest = (await readRecords(path)).filter(record => forPage(record) && record.agent === agent)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      if (!newest) return { session: await createWithRetry(path, endpoint, agent, request), rewrite: true, ...(notice ? { notice } : {}) };
      if (!await usable(path, endpoint, newest)) return answer(newest, notice);
      const replaced = await replace(path, endpoint, agent, request, (await readRecords(path)).find(record => record.id === newest.id) ?? newest);
      return { session: replaced, rewrite: true, ...(notice ? { notice } : {}) };
    });
  };
}
