import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { Client } from "@dojofoo/agent/client";
import { createHostPortServer, HostPortFailure, type HostPortHandlers, type HostPortMethod } from "@dojofoo/agent/host-port";
import type { AgentEndpoint, SessionRecord } from "@dojofoo/agent-api";
import { readCourseManifest, readDojoMd } from "@dojofoo/config";
import type { InteractiveContext, Persona, SenseiSessionInfo } from "@dojofoo/protocol";
import { applyLifecycle } from "./agent-session/lifecycle";
import { captureLearnerEvidence } from "./agent-session/evidence";
import { readRecords } from "./agent-session/records";
import { resolveWorkspaceId } from "./control/workspace";
import { getInteractiveLesson } from "./interactive/service";

/** Where persona hosts reach the host port: loopback on the UI server's own port, never DOJO_UI_BASE_URL, whose portless TLS proxy
 *  the Eve host's fetch may not trust (decision 8). A wildcard or empty HOST is loopback. */
export function hostPortUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const host = environment.HOST?.trim();
  const loopback = !host || ["0.0.0.0", "::", "[::]"].includes(host) ? "127.0.0.1" : host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${loopback}:${environment.PORT || "4567"}/api/host-port`;
}

type Host = { secret: string; endpoint: AgentEndpoint };
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
  if (readCourseManifest(path, courseId).mode !== "interactive") throw new HostPortFailure(422, "invalid_request", "Kata lessons still run on their own connection.");
  const { references: _references, ...lesson } = getInteractiveLesson(path, courseId);
  const guidance = readDojoMd(path, courseId);
  const title = readCourseManifest(path, courseId).name ?? courseId;
  return { kind: "interactive", hash: createHash("sha256").update(JSON.stringify({ lesson, guidance })).digest("hex"), course: { id: courseId, title }, guidance, lesson };
}

const read = <Input, Result>(handle: HostPortMethod<Input, Result>["handle"]): HostPortMethod<Input, Result> => ({ mutates: false, handle });
const mutate = <Input, Result>(handle: HostPortMethod<Input, Result>["handle"]): HostPortMethod<Input, Result> => ({ mutates: true, handle });

/** Both personas report their turns; a settled Sensei turn also keeps the learner's evidence. */
const lifecycleMethods = (persona: Persona): Record<string, HostPortMethod> => ({
  "turn.paused": mutate<{ turnId?: unknown }, { ok: true }>(async ({ workspaceId, sessionId, input }) => {
    await applyLifecycle(workspacePath(workspaceId), sessionId, { type: "turn.paused", turnId: String(input?.turnId ?? "") });
    return { ok: true };
  }),
  "turn.settled": mutate<unknown, { ok: true }>(async ({ workspaceId, sessionId }) => {
    const path = workspacePath(workspaceId);
    const record = await applyLifecycle(path, sessionId, { type: "turn.settled" });
    const host = hosts.get(hostKey(workspaceId, persona));
    if (persona === "sensei" && record?.courseId && host) {
      try {
        const { events } = await new Client(host.endpoint).sessions.attach(sessionId).snapshot({ signal: AbortSignal.timeout(2_000) });
        await captureLearnerEvidence(path, record, events);
      } catch (error) {
        console.warn(`Could not keep the learner's evidence for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { ok: true };
  }),
  "session.ended": mutate<unknown, { ok: true }>(async ({ workspaceId, sessionId }) => {
    await applyLifecycle(workspacePath(workspaceId), sessionId, { type: "session.ended" });
    return { ok: true };
  }),
  "resume.failed": mutate<unknown, { ok: true }>(async ({ workspaceId, sessionId }) => {
    await applyLifecycle(workspacePath(workspaceId), sessionId, { type: "resume.failed" });
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
    context: read<unknown, InteractiveContext>(async ({ workspaceId, sessionId }) => {
      const { path, record } = await sessionRecord(workspaceId, sessionId);
      return interactiveContext(path, courseOf(record));
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
