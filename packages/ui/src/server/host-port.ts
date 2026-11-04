import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { Client } from "@dojofoo/agent/client";
import { createHostPortServer, hostPortAnswer, HostPortFailure, type HostPortHandlers, type HostPortMethod } from "@dojofoo/agent/host-port";
import type { AgentEndpoint, DefaultSessionRequest, DefaultSessionResponse, SessionRecord } from "@dojofoo/agent-api";
import { readCourseManifest, readDojoMd } from "@dojofoo/config";
import type { AgentId, InteractiveContext, KataContext, LessonCheck, LessonNavigation, Persona, SenseiContext, SenseiSessionInfo } from "@dojofoo/protocol";
import { applyLifecycle, type TurnOutcome } from "./agent-session/lifecycle";
import { captureLearnerEvidence } from "./agent-session/evidence";
import { dropHeld, markSeen, runLessonCheck, sendHeld } from "./agent-session/check-reports";
import { courseEvidence } from "./agent-session/evidence";
import { guardedLesson, verifyWindow } from "./agent-session/guard";
import { notifyPage, pageKeyOf } from "./agent-session/notify";
import { readRecords } from "./agent-session/records";
import { advanceLesson, dojoLessonContext, dojoLessonFragment, latestObservationId, lessonSource, markLessonIntroduced, readLesson, saveObservation } from "./lesson/service";
import { resolveWorkspaceId } from "./control/workspace";
import { getInteractiveLesson } from "./interactive/service";

/** Where persona hosts reach the host port: loopback on the UI server's own port, never DOJO_UI_BASE_URL, whose portless TLS proxy
 *  the Eve host's fetch may not trust (decision 8). A wildcard or empty HOST is loopback. */
export function hostPortUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const host = environment.HOST?.trim();
  const loopback = !host || ["0.0.0.0", "::", "[::]"].includes(host) ? "127.0.0.1" : host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${loopback}:${environment.PORT || "4567"}/api/host-port`;
}

/** A running persona host: its secret, where it serves, and the coding agent it runs (decision 30). `openDefault` is its AgentRuntime's
 *  get-or-create, which a settle's replacement uses (D28). */
type Host = { secret: string; endpoint: AgentEndpoint; agent?: AgentId; openDefault?: (request: DefaultSessionRequest) => Promise<DefaultSessionResponse> };
const hostsKey = Symbol.for("dojofoo.host-port.hosts");
// Process-global: route modules may be loaded twice by the dev runner
const hosts = ((globalThis as Record<symbol, unknown>)[hostsKey] ??= new Map<string, Host>()) as Map<string, Host>;
const hostKey = (workspaceId: string, persona: Persona) => `${workspaceId}\0${persona}`;

/** Each host start registers its secret, which authenticates its host-port calls, until it exits or closes. */
export function registerHost(workspaceId: string, persona: Persona, host: Host): void {
  hosts.set(hostKey(workspaceId, persona), host);
}
export function forgetHost(workspaceId: string, persona: Persona, secret?: string): void {
  const key = hostKey(workspaceId, persona);
  if (!secret || hosts.get(key)?.secret === secret) hosts.delete(key);
}

const workspacePath = (workspaceId: string) => {
  try { return resolveWorkspaceId(workspaceId); }
  catch { throw new HostPortFailure(404, "workspace_not_found", "Workspace not found."); }
};
async function sessionRecord(workspaceId: string, sessionId: string): Promise<{ path: string; record: SessionRecord }> {
  const path = workspacePath(workspaceId);
  const record = (await readRecords(path)).find(item => item.id === sessionId);
  if (!record) throw new HostPortFailure(404, "session_not_found", "Session not found.");
  return { path, record };
}
const courseOf = (record: SessionRecord) => {
  if (!record.courseId) throw new HostPortFailure(422, "invalid_request", "This conversation teaches no course.");
  return record.courseId;
};

/** Sensei's course material: an interactive course's current lesson (without its references) and its DOJO.md. */
function interactiveContext(path: string, courseId: string): InteractiveContext {
  const { references: _references, ...lesson } = getInteractiveLesson(path, courseId);
  const guidance = readDojoMd(path, courseId);
  const title = readCourseManifest(path, courseId).name ?? courseId;
  return { kind: "interactive", hash: createHash("sha256").update(JSON.stringify({ lesson, guidance })).digest("hex"), course: { id: courseId, title }, guidance, lesson };
}

const isKata = (path: string, courseId: string) => readCourseManifest(path, courseId).mode !== "interactive";
const lessonOf = (record: SessionRecord) => {
  if (!record.lessonId) throw new HostPortFailure(422, "invalid_request", "This conversation teaches no kata lesson.");
  return record.lessonId;
};

/** The "last sent" file marker (design, "Host port"), in memory per session: a restart (another secret), a model change (a raised
 *  revision) or an eviction (a cancelled or failed settle) resets it, so the next read sends the file again. */
type FileMarker = { sha256: string; secret: string; revision: number };
const markersKey = Symbol.for("dojofoo.host-port.file-markers");
const markers = ((globalThis as Record<symbol, unknown>)[markersKey] ??= new Map<string, FileMarker>()) as Map<string, FileMarker>;

/** Sensei's kata material: the lesson's context (file, latest check, evidence), DOJO.md, and its SENSEI.md with its fragment ids. */
async function kataContext(path: string, workspaceId: string, record: SessionRecord, options: { instructions: boolean }): Promise<KataContext> {
  const courseId = courseOf(record);
  const lessonId = lessonOf(record);
  const lesson = await readLesson(path, courseId, lessonId);
  if (!lesson) throw new HostPortFailure(404, "lesson_not_found", "Lesson not found.");
  const context = dojoLessonContext(lesson);
  const guidance = readDojoMd(path, courseId) ?? "";
  const source = lessonSource(path, courseId, lessonId);
  const body: KataContext = { kind: "kata", hash: createHash("sha256").update(JSON.stringify({ context, guidance, source })).digest("hex"),
    course: { id: courseId, title: lesson.course?.title ?? courseId }, guidance,
    lesson: { id: lessonId, source, fragmentIds: Object.keys(lesson.fragments) }, context };
  if (options.instructions) return body;
  const secret = hosts.get(hostKey(workspaceId, "sensei"))?.secret ?? "";
  const sha256 = createHash("sha256").update(lesson.code).digest("hex");
  const marker = markers.get(record.id);
  const unchanged = marker?.sha256 === sha256 && marker.secret === secret && marker.revision === record.revision;
  markers.set(record.id, { sha256, secret, revision: record.revision });
  // Sensei read this check: its report is seen, and a held one need not be sent (D16)
  const observationId = latestObservationId(path, courseId, lessonId);
  if (observationId) await markSeen(path, workspaceId, record.id, { observationId });
  return unchanged ? { ...body, context: { ...context, learner: { ...context.learner, file: { ...context.learner.file, content: "" } } }, fileUnchanged: true } : body;
}

const read = <Input, Result>(handle: HostPortMethod<Input, Result>["handle"]): HostPortMethod<Input, Result> => ({ mutates: false, handle });
const mutate = <Input, Result>(handle: HostPortMethod<Input, Result>["handle"]): HostPortMethod<Input, Result> => ({ mutates: true, handle });

const outcomeOf = (value: unknown): TurnOutcome => value === "failed" || value === "cancelled" ? value : "completed";

/** The Replacement rule at a settle (D28, decision 18): under the page key's lock, so a browser asking at once gets the same one.
 *  A held report moves to the replacement and goes out once its begin settles. */
async function replaceAfterResumeFailure(path: string, workspaceId: string, host: Host, record: SessionRecord): Promise<void> {
  if (!host.openDefault || !record.courseId) return;
  const held = record.lifecycle?.heldReport;
  // Moved, not dropped: the old session's end must not drop it on the way
  if (held) await applyLifecycle(path, record.id, { type: "report-dropped" });
  const { session } = await host.openDefault({ course: record.courseId, ...(record.lessonId ? { lesson: record.lessonId } : {}), new: true, from: record.id });
  if (held) await applyLifecycle(path, session.id, { type: "report-held", observationId: held.observationId, text: held.text });
  const key = pageKeyOf(workspaceId, record);
  if (key) notifyPage(key, "session.replaced", { from: record.id, to: session.id });
}

/** Both personas report their turns; the guard verifies first (rule 2), a settled Sensei turn also keeps the learner's evidence,
 *  and the work that must follow the hook's answer (open risk 4) runs after the body is read. */
const lifecycleMethods = (persona: Persona): Record<string, HostPortMethod> => ({
  "turn.paused": mutate<{ turnId?: unknown }, { ok: true }>(async ({ workspaceId, sessionId, input }) => {
    const path = workspacePath(workspaceId);
    const turnId = String(input?.turnId ?? "");
    await verifyWindow(path, workspaceId, sessionId, { ...(turnId ? { turnId } : {}), at: "pause" });
    await applyLifecycle(path, sessionId, { type: "turn.paused", turnId });
    return { ok: true };
  }),
  "turn.settled": mutate<{ turnId?: unknown; outcome?: unknown }, unknown>(async ({ workspaceId, sessionId, input }) => {
    const path = workspacePath(workspaceId);
    const turnId = typeof input?.turnId === "string" && input.turnId ? input.turnId : undefined;
    const outcome = outcomeOf(input?.outcome);
    await verifyWindow(path, workspaceId, sessionId, turnId ? { turnId } : {});
    const before = (await readRecords(path)).find(item => item.id === sessionId);
    const record = await applyLifecycle(path, sessionId, { type: "turn.settled", outcome });
    // The hook evicted the native session, which no longer has the file
    if (outcome !== "completed") markers.delete(sessionId);
    const host = hosts.get(hostKey(workspaceId, persona));
    if (persona === "sensei" && record?.courseId && host) {
      try {
        const { events } = await new Client(host.endpoint).sessions.attach(sessionId).snapshot({ signal: AbortSignal.timeout(2_000) });
        await captureLearnerEvidence(path, record, events);
      } catch (error) {
        console.warn(`Could not keep the learner's evidence for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // A completed begin introduced the kata lesson
    const lesson = before && guardedLesson(path, before);
    if (lesson && before?.lifecycle?.beginPending && outcome === "completed" && before.lifecycle.status !== "interrupted") {
      markLessonIntroduced(path, lesson.courseId, lesson.lessonId);
    }
    if (persona !== "sensei" || !record || !host) return { ok: true };
    return hostPortAnswer({ ok: true }, async () => {
      if (record.lifecycle?.resumeFailedAt) await replaceAfterResumeFailure(path, workspaceId, host, record);
      await sendHeld(path, workspaceId, host.endpoint, sessionId);
    });
  }),
  "session.ended": mutate<unknown, { ok: true }>(async ({ workspaceId, sessionId }) => {
    const path = workspacePath(workspaceId);
    await dropHeld(path, workspaceId, sessionId);
    await applyLifecycle(path, sessionId, { type: "session.ended" });
    return { ok: true };
  }),
  "resume.failed": mutate<unknown, { ok: true }>(async ({ workspaceId, sessionId }) => {
    await applyLifecycle(workspacePath(workspaceId), sessionId, { type: "resume.failed" });
    return { ok: true };
  }),
  /** The lifecycle hook reports only a check report's consumption (D16: "Sensei saw this") */
  "delivery.consumed": mutate<{ deliveryId?: unknown }, { ok: true }>(async ({ workspaceId, sessionId, input }) => {
    if (typeof input?.deliveryId === "string" && input.deliveryId) await markSeen(workspacePath(workspaceId), workspaceId, sessionId, { deliveryId: input.deliveryId });
    return { ok: true };
  }),
});

type Trial = { status: "running" } | { status: "finished"; result: unknown } | { status: "failed"; error: string };
const trialsKey = Symbol.for("dojofoo.host-port.trials");
const trials = ((globalThis as Record<symbol, unknown>)[trialsKey] ??= new Map<string, Trial>()) as Map<string, Trial>;

/** Kyoshi's evaluation, today's evaluateFromAuthoring run in the background (step 7 moves Kyoshi's tool onto these methods).
 *  `run` is replaceable for tests: authoring loads through Node's require, outside Vite's module graph. */
export const evaluationRunner = { run: startEvaluation };
async function startEvaluation(root: string, lessonIds: string[], callId: string): Promise<unknown> {
  const load = createRequire(import.meta.url);
  const { evaluateFromAuthoring, evaluationConfiguration } = load("@dojofoo/authoring/evaluation/host") as typeof import("@dojofoo/authoring/evaluation/host");
  const { configuredEvaluation, readEvaluationSettings } = load("@dojofoo/authoring/evaluation/settings") as typeof import("@dojofoo/authoring/evaluation/settings");
  const config = await readEvaluationSettings(root) ? await configuredEvaluation(root) : evaluationConfiguration();
  return evaluateFromAuthoring({ root, config, lessonIds, callId, signal: AbortSignal.timeout(60 * 60_000) });
}

export const hostPortHandlers: HostPortHandlers = {
  sensei: {
    session: read<unknown, SenseiSessionInfo>(async ({ workspaceId, sessionId }) => {
      const { path, record } = await sessionRecord(workspaceId, sessionId);
      const courseId = courseOf(record);
      return {
        courseId, ...(record.lessonId ? { lessonId: record.lessonId } : {}),
        mode: readCourseManifest(path, courseId).mode === "interactive" ? "interactive" : "katas",
        ...(record.model ? { model: record.model } : {}), revision: record.revision,
      };
    }),
    /** Before every model call, outside any memo (decision 6): a turn an agent switch interrupted, or another agent's session, never runs */
    "turn.check": read<{ turnId?: unknown }, { ok: true }>(async ({ workspaceId, sessionId, input }) => {
      const { record } = await sessionRecord(workspaceId, sessionId);
      const turnId = typeof input?.turnId === "string" ? input.turnId : undefined;
      const host = hosts.get(hostKey(workspaceId, "sensei"));
      const lifecycle = record.lifecycle;
      if (lifecycle?.status === "interrupted" || (turnId && lifecycle?.interruptedTurnId === turnId) || (host?.agent && record.agent !== host.agent)) {
        throw new HostPortFailure(409, "turn_interrupted", "This turn was interrupted by an agent switch.");
      }
      return { ok: true };
    }),
    context: read<{ instructions?: unknown }, SenseiContext>(async ({ workspaceId, sessionId, input }) => {
      const { path, record } = await sessionRecord(workspaceId, sessionId);
      const courseId = courseOf(record);
      return isKata(path, courseId) ? kataContext(path, workspaceId, record, { instructions: input?.instructions === true }) : interactiveContext(path, courseId);
    }),
    /** `dojo_lesson_verify`: the record's lesson's checks, never the CLI's current course (D30) */
    check: mutate<unknown, LessonCheck>(async ({ workspaceId, sessionId }) => {
      const { path, record } = await sessionRecord(workspaceId, sessionId);
      const { observation } = await runLessonCheck({ path, workspaceId }, courseOf(record), lessonOf(record));
      return { observationId: observation.id, report: observation.report };
    }),
    /** `dojo_learner_observe`: sources from Eve's evidence store, kept in web.json's learnerObservations (decision 12) */
    observe: mutate<unknown, { observation: unknown }>(async ({ workspaceId, sessionId, input }) => {
      const { path, record } = await sessionRecord(workspaceId, sessionId);
      const courseId = courseOf(record);
      try { return { observation: saveObservation(path, courseId, input, await courseEvidence(path, courseId)) }; }
      catch (error) { throw new HostPortFailure(422, "invalid_request", error instanceof Error ? error.message : String(error)); }
    }),
    /** `dojo_ui_show`: only the lesson's own authored fragments */
    show: read<{ fragmentId?: unknown }, { fragmentId: string }>(async ({ workspaceId, sessionId, input }) => {
      const { path, record } = await sessionRecord(workspaceId, sessionId);
      const lesson = await readLesson(path, courseOf(record), lessonOf(record));
      if (!lesson) throw new HostPortFailure(404, "lesson_not_found", "Lesson not found.");
      try { return dojoLessonFragment(lesson, String(input?.fragmentId ?? "")); }
      catch (error) { throw new HostPortFailure(422, "invalid_request", error instanceof Error ? error.message : String(error)); }
    }),
    /** `dojo_lesson_complete`'s Move on: 409 lesson_incomplete unless the lesson's checks pass or it is completed (decision 20) */
    navigate: mutate<unknown, LessonNavigation>(async ({ workspaceId, sessionId }) => {
      const { path, record } = await sessionRecord(workspaceId, sessionId);
      const courseId = courseOf(record);
      const lessonId = lessonOf(record);
      const next = await advanceLesson(path, courseId, lessonId);
      for (const other of (await readRecords(path)).filter(item => item.courseId === courseId && item.lessonId === lessonId)) await dropHeld(path, workspaceId, other.id);
      const navigation = { courseId, lessonId: next.kata };
      notifyPage({ workspaceId, courseId, lessonId }, "lesson.navigated", navigation);
      return navigation;
    }),
    ...lifecycleMethods("sensei"),
  },
  kyoshi: {
    "evaluation.start": mutate<{ lessonIds?: unknown }, { trialId: string }>(async ({ workspaceId, idempotencyKey, input }) => {
      const lessonIds = input?.lessonIds;
      if (!Array.isArray(lessonIds) || !lessonIds.length || lessonIds.some(id => typeof id !== "string" || !id)) {
        throw new HostPortFailure(422, "invalid_request", "Name the lessons to evaluate.");
      }
      const root = workspacePath(workspaceId);
      const trialId = randomUUID();
      trials.set(trialId, { status: "running" });
      void evaluationRunner.run(root, lessonIds as string[], idempotencyKey).then(
        result => trials.set(trialId, { status: "finished", result }),
        error => trials.set(trialId, { status: "failed", error: error instanceof Error ? error.message : String(error) }));
      return { trialId };
    }),
    "evaluation.status": read<{ trialId?: unknown }, Trial>(({ input }) => {
      const trial = typeof input?.trialId === "string" ? trials.get(input.trialId) : undefined;
      if (!trial) throw new HostPortFailure(404, "trial_not_found", "No such evaluation.");
      return trial;
    }),
    ...lifecycleMethods("kyoshi"),
  },
};

/** `POST /api/host-port/{workspaceId}/{persona}/{method}`, authenticated by the running host's per-start secret. */
export const hostPortServer = createHostPortServer({
  secret: (workspaceId, persona) => hosts.get(hostKey(workspaceId, persona))?.secret,
  handlers: hostPortHandlers,
});
