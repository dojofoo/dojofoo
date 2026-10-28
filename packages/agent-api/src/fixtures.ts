import type { Client, MessageStreamEvent } from "@dojofoo/agent/client";
import type { Agent, AgentRuntime, Persona, SessionRecord } from "./runtime";
import { AgentApiError } from "./runtime";

type Event = MessageStreamEvent;
const event = (value: unknown) => value as Event;

/** One Eve turn: the user's message, a streamed reply, optionally a tool call or a question. */
export function turn(turnId: string, message: string, reply: string[], options: { tool?: boolean; question?: boolean; tail?: string[] } = {}): Event[] {
  let n = 0;
  const meta = () => ({ at: "2026-10-28T12:00:00.000Z", id: `${turnId}-${n++}`, deliveryIds: [] });
  const sequence = () => n;
  const events: Event[] = [
    event({ type: "turn.started", data: { sequence: sequence(), turnId }, meta: meta() }),
    event({ type: "message.received", data: { sequence: sequence(), turnId, message }, meta: meta() }),
    event({ type: "step.started", data: { sequence: sequence(), turnId, stepIndex: 0, modelId: "model" }, meta: meta() }),
    ...reply.map(delta => event({ type: "message.appended", data: { sequence: sequence(), turnId, stepIndex: 0, messageDelta: delta }, meta: meta() })),
  ];
  if (options.question) {
    const action = { callId: `${turnId}-ask`, kind: "tool-call", toolName: "dojo_ui_ask", input: {} };
    events.push(
      event({ type: "actions.requested", data: { sequence: sequence(), turnId, stepIndex: 0, actions: [action] }, meta: meta() }),
      event({ type: "input.requested", data: { sequence: sequence(), turnId, stepIndex: 0, requests: [{ action, requestId: `${turnId}-q`, kind: "question", prompt: "Review?", options: [{ id: "review", label: "Review" }] }] }, meta: meta() }),
      event({ type: "session.waiting", data: { continuationToken: "s", wait: "next-user-message" }, meta: meta() }),
    );
    return events;
  }
  let step = 0;
  if (options.tool) {
    const action = { callId: `${turnId}-read`, kind: "tool-call", toolName: "read", input: { path: "lesson.md" } };
    events.push(
      event({ type: "actions.requested", data: { sequence: sequence(), turnId, stepIndex: 0, actions: [action] }, meta: meta() }),
      event({ type: "action.result", data: { sequence: sequence(), turnId, stepIndex: 0, status: "completed", result: { callId: action.callId, kind: "tool-result", toolName: "read", output: "# Lesson" } }, meta: meta() }),
      event({ type: "step.completed", data: { sequence: sequence(), turnId, stepIndex: 0, finishReason: "tool-calls" }, meta: meta() }),
      event({ type: "step.started", data: { sequence: sequence(), turnId, stepIndex: 1, modelId: "model" }, meta: meta() }),
      ...(options.tail ?? []).map(delta => event({ type: "message.appended", data: { sequence: sequence(), turnId, stepIndex: 1, messageDelta: delta }, meta: meta() })),
    );
    step = 1;
  }
  const text = step ? (options.tail ?? []).join("") : reply.join("");
  events.push(
    event({ type: "message.completed", data: { sequence: sequence(), turnId, stepIndex: step, message: text, finishReason: "stop" }, meta: meta() }),
    event({ type: "step.completed", data: { sequence: sequence(), turnId, stepIndex: step, finishReason: "stop" }, meta: meta() }),
    event({ type: "turn.completed", data: { sequence: sequence(), turnId }, meta: meta() }),
    event({ type: "session.waiting", data: { continuationToken: "s", wait: "next-user-message" }, meta: meta() }),
  );
  return events;
}

async function* replay(events: readonly Event[]) { yield* events; }

/** An in-memory Eve: each message runs the next scripted turn. */
export class FakeEve {
  readonly histories = new Map<string, Event[]>();
  readonly continuations = new Map<string, Event[]>();
  readonly sent: { sessionId: string; message: unknown; context?: unknown }[] = [];
  readonly answered: { sessionId: string; answers: unknown }[] = [];
  readonly cancelled: string[] = [];
  #sessions = 0;
  #turns = 0;
  constructor(private readonly script: (message: unknown, turnId: string) => Event[]) {}

  #run(sessionId: string, message: unknown) {
    const events = this.script(message, `turn-${++this.#turns}`);
    this.histories.get(sessionId)!.push(...events);
    return replay(events);
  }

  client(): Client {
    const sessions = {
      create: async ({ message, clientContext }: { message: string; clientContext?: unknown }) => {
        const sessionId = `session-${++this.#sessions}`;
        this.histories.set(sessionId, []);
        this.sent.push({ sessionId, message, context: clientContext });
        const response = this.#run(sessionId, message);
        return { session: { state: { sessionId, streamIndex: 0 } }, response };
      },
      attach: (sessionId: string) => ({
        state: { sessionId, streamIndex: this.histories.get(sessionId)?.length ?? 0 },
        snapshot: async () => {
          const events = this.histories.get(sessionId);
          if (!events) throw Object.assign(new Error("Session not found."), { status: 404 });
          return { events: [...events], session: { sessionId, streamIndex: events.length } };
        },
        send: async (message: unknown, options?: { clientContext?: unknown }) => {
          this.sent.push({ sessionId, message, context: options?.clientContext });
          return this.#run(sessionId, message);
        },
        respond: async (answers: unknown) => {
          this.answered.push({ sessionId, answers });
          return this.#run(sessionId, "(answers)");
        },
        stream: () => {
          const events = this.continuations.get(sessionId) ?? [];
          this.continuations.delete(sessionId);
          this.histories.get(sessionId)!.push(...events);
          return replay(events);
        },
        cancel: async () => { this.cancelled.push(sessionId); return { outcome: "applied" }; },
      }),
    };
    return { sessions } as unknown as Client;
  }
}

/** A runtime with one workspace whose selected coding agent is Codex. */
export function fakeRuntime(eve: FakeEve, workspaceId = "ws-1"): AgentRuntime & { records: SessionRecord[]; started: string[] } {
  const records: SessionRecord[] = [];
  const started: string[] = [];
  const known = (id: string) => { if (id !== workspaceId) throw new AgentApiError(404, "workspace_not_found", "Workspace not found."); };
  const agents = (): Agent[] => [
    { id: "codex", name: "Codex", selected: true, status: started.includes("codex") ? "ready" : "stopped" },
    { id: "opencode", name: "OpenCode", selected: false, status: "stopped" },
  ];
  return {
    records, started,
    agents: async id => { known(id); return agents(); },
    start: async (id, agentId) => {
      known(id);
      if (agentId !== "codex") throw new AgentApiError(409, "agent_unavailable", "Only the selected coding agent can start.");
      started.push(agentId);
      return { ...agents()[0], status: "starting" };
    },
    stop: async (id, agentId) => { known(id); return { ...agents().find(agent => agent.id === agentId)!, status: "stopped" }; },
    connect: async id => { known(id); return eve.client(); },
    greeting: (persona: Persona) => `Hello ${persona}`,
    context: async () => ({ course: "starter" }),
    sessions: {
      list: async id => { known(id); return records; },
      get: async (id, sessionId) => { known(id); return records.find(item => item.id === sessionId); },
      save: async (id, session) => { known(id); records.push(session); },
    },
  };
}
