import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@dojofoo/agent/client";
import { emptySessionView, foldEvents, openInteractions } from "@dojofoo/agent/messages";
import { LAUNCH_TOKEN_HEADER } from "@dojofoo/agent/api";
import type { CheckObservation } from "../lesson/service";

export interface TrialTurn {
  /** Sensei's learner-visible text and tool calls in this turn, in order */
  parts: Array<{ type: "text-delta"; id: string; delta: string } | { type: "tool-call"; toolName: string; input: unknown }>;
  /** The turn paused on a question (ask_question or dojo_lesson_complete) */
  questions?: Array<{ interactionId: string; title: string; options: Array<{ id: string; title: string }>; allowOther: boolean }>;
  outcome: "paused" | "completed" | "failed" | "cancelled";
  /** Eve's budget prompt opened: the per-trial ceiling was crossed (design: the trial fails at once) */
  budget?: true;
  error?: string;
}

/** How a trial reaches its Sensei: the routes a learner's page uses. */
export interface TrialChannel {
  /** POST /sessions/default for (course, lesson); follows the begin turn until it pauses or settles */
  open(courseId: string, lessonId: string, signal: AbortSignal): Promise<{ sessionId: string; turn: TrialTurn }>;
  /** A message through /sessions/:id/eve/*, followed to its pause or settle */
  send(sessionId: string, text: string, signal: AbortSignal): Promise<TrialTurn>;
  /** respond([{ interactionId, optionId | text }]) through /eve/*, followed to the resumed turn's pause or settle */
  answer(sessionId: string, answers: Array<{ interactionId: string; optionId?: string; text?: string }>, signal: AbortSignal): Promise<TrialTurn>;
  /** PUT …/files/solution */
  save(courseId: string, lessonId: string, content: string): Promise<void>;
  /** POST …/checks; with a session, follows the check report's turn (offerCheckReport sends it when the session is idle) */
  check(courseId: string, lessonId: string, signal: AbortSignal, sessionId?: string): Promise<{ observation: CheckObservation; turn?: TrialTurn }>;
  /** POST …/progressions */
  advance(courseId: string, lessonId: string): Promise<void>;
  /** Eve's cancel through /eve/* */
  cancel(sessionId: string): Promise<void>;
}

type EveSession = ReturnType<Client["sessions"]["attach"]>;
type Events = Awaited<ReturnType<EveSession["snapshot"]>>["events"];
type Event = Events[number] & { type: string; data?: Record<string, unknown> };

/** The turn that ends with the first pause or settle in `events` (those after the action's start), or undefined while it runs */
export function turnOf(events: readonly Event[], all: readonly Event[]): TrialTurn | undefined {
  const end = events.findIndex(event => event.type === "turn.paused" || event.type === "turn.settled");
  if (end < 0) return undefined;
  const parts: TrialTurn["parts"] = [];
  let budget = false;
  for (const event of events.slice(0, end + 1)) {
    const data = event.data ?? {};
    if (event.type === "content.completed" && data.kind === "text") {
      const text = typeof data.value === "string" ? data.value : typeof data.fallbackText === "string" ? data.fallbackText : "";
      if (text) parts.push({ type: "text-delta", id: String(data.partId), delta: text });
    } else if (event.type === "call.requested") {
      const capability = data.capability as { kind?: string; name?: string } | undefined;
      if (capability?.kind === "tool" && capability.name) parts.push({ type: "tool-call", toolName: capability.name, input: data.input });
    } else if (event.type === "interaction.opened" && (data.request as { kind?: string } | undefined)?.kind === "budget") budget = true;
  }
  const last = events[end]!;
  if (last.type === "turn.settled") {
    const error = (last.data?.error as { message?: string } | undefined)?.message;
    return { parts, outcome: last.data?.outcome as TrialTurn["outcome"], ...(budget ? { budget: true } : {}), ...(error ? { error } : {}) };
  }
  const questions = openInteractions(foldEvents(emptySessionView(), all as Events)).filter(open => open.request.kind === "question").map(open => ({
    interactionId: open.interactionId, title: open.request.prompt,
    options: (open.request.options ?? []).map(option => ({ id: option.id, title: option.label })),
    allowOther: open.request.allowFreeform ?? false,
  }));
  return { parts, outcome: "paused", ...(questions.length ? { questions } : {}), ...(budget ? { budget: true } : {}) };
}

/** The production channel: fetch to the UI server's own loopback origin, the launch token on /sessions/default and no Origin; Eve's
 *  client on each session's routes. A turn is done only when Eve's stream shows it paused or settled and the session record has
 *  left `working`, so the hooks' guard verify and transitions have run (step-7 plan, decision 37). */
export function httpChannel(options: { baseUrl: string; workspaceId: string; token: string;
  /** Tests only: a session's Eve client in place of `@dojofoo/agent/client` on its routes */
  eve?: (sessionId: string) => Pick<EveSession, "snapshot" | "send" | "respond" | "cancel"> }): TrialChannel {
  const api = `${options.baseUrl.replace(/\/$/u, "")}/api/v1/workspaces/${encodeURIComponent(options.workspaceId)}`;
  const lesson = (courseId: string, lessonId: string) =>
    `${options.baseUrl.replace(/\/$/u, "")}/api/workspaces/${encodeURIComponent(options.workspaceId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`;
  const session = options.eve ?? ((sessionId: string) => new Client({ baseUrl: `${api}/sessions/${encodeURIComponent(sessionId)}` }).sessions.attach(sessionId));
  const request = async <T>(url: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init.headers } });
    const body = await response.json().catch(() => ({})) as T & { error?: unknown; message?: unknown };
    if (!response.ok) throw new Error(`${init.method ?? "GET"} ${new URL(url).pathname} answered ${response.status}: ${String(body.message ?? body.error ?? "")}`);
    return body;
  };
  const status = async (sessionId: string) =>
    (await request<{ lifecycle?: { status?: string } }>(`${api}/sessions/${encodeURIComponent(sessionId)}`)).lifecycle?.status ?? "idle";
  const events = async (sessionId: string, signal: AbortSignal) =>
    (await session(sessionId).snapshot({ signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) })).events as readonly Event[];
  const settled = async (sessionId: string, signal: AbortSignal) => {
    while (await status(sessionId) === "working") await delay(250, undefined, { signal });
  };
  /** The first turn to pause or settle after event `from`, once the record has left working */
  const follow = async (sessionId: string, from: number, signal: AbortSignal): Promise<TrialTurn> => {
    for (;;) {
      const all = await events(sessionId, signal);
      const turn = turnOf(all.slice(from), all);
      if (turn && await status(sessionId) !== "working") return turn;
      await delay(250, undefined, { signal });
    }
  };
  return {
    async open(courseId, lessonId, signal) {
      const opened = await request<{ session: { id: string } }>(`${api}/sessions/default`, {
        method: "POST", headers: { [LAUNCH_TOKEN_HEADER]: options.token }, body: JSON.stringify({ course: courseId, lesson: lessonId }), signal,
      });
      return { sessionId: opened.session.id, turn: await follow(opened.session.id, 0, signal) };
    },
    async send(sessionId, text, signal) {
      const from = (await events(sessionId, signal)).length;
      await session(sessionId).send(text, { signal });
      return follow(sessionId, from, signal);
    },
    async answer(sessionId, answers, signal) {
      const from = (await events(sessionId, signal)).length;
      await session(sessionId).respond(answers, { signal });
      return follow(sessionId, from, signal);
    },
    async save(courseId, lessonId, content) {
      await request(`${lesson(courseId, lessonId)}/files/solution`, { method: "PUT", body: JSON.stringify({ content }) });
    },
    async check(courseId, lessonId, signal, sessionId) {
      // Posted only once the turn is over, so the report is sent at once rather than held
      if (sessionId) await settled(sessionId, signal);
      const from = sessionId ? (await events(sessionId, signal)).length : 0;
      const checked = await request<{ data: { meta: { observation: CheckObservation } } }>(`${lesson(courseId, lessonId)}/checks`, { method: "POST", signal });
      return { observation: checked.data.meta.observation, ...(sessionId ? { turn: await follow(sessionId, from, signal) } : {}) };
    },
    async advance(courseId, lessonId) {
      await request(`${lesson(courseId, lessonId)}/progressions`, { method: "POST" });
    },
    async cancel(sessionId) {
      await session(sessionId).cancel({ signal: AbortSignal.timeout(10_000) });
    },
  };
}
