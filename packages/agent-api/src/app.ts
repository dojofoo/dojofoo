import { ClientError, conversationReducer, defaultMessageReducer, type Client, type MessageStreamEvent } from "@dojofoo/agent/client";
import { eveChatMessages } from "@dojofoo/authoring/eve/messages";
import { eveQuestionInterrupts } from "@dojofoo/authoring/eve/stream";
import { toServerSentEventsResponse } from "@tanstack/ai";
import { Elysia } from "elysia";
import { runInput } from "./input";
import { AgentApiError, type AgentRuntime, type Persona, type SessionRecord } from "./runtime";
import { routes } from "./schema";
import { followTurn, streamEveRun } from "./stream";

/**
 * The workspace agent API: coding agents, sessions and runs under `/api/v1`. Mount
 * its `fetch` in any host (Hono's `app.mount`, Elysia's `.mount`, a Worker's
 * `fetch`); the runtime decides where agents actually run.
 */
export function createAgentApi(runtime: AgentRuntime) {
  const reducer = defaultMessageReducer();

  const record = async (workspaceId: string, sessionId: string): Promise<SessionRecord> => {
    const session = await runtime.sessions.get(workspaceId, sessionId);
    if (!session) throw new AgentApiError(404, "session_not_found", "Session not found.");
    return session;
  };
  /** Eve's durable state for a session, read once from its tail */
  const read = async (client: Client, sessionId: string, signal: AbortSignal) => {
    const snapshot = await client.sessions.attach(sessionId).snapshot({ signal });
    return {
      session: client.sessions.attach(snapshot.session.sessionId, { streamIndex: snapshot.session.streamIndex }),
      position: snapshot.session.streamIndex,
      projection: snapshot.events.reduce(reducer.reduce, reducer.initial()),
      events: snapshot.events,
    };
  };
  const connect = (workspaceId: string, session: SessionRecord) =>
    runtime.connect(workspaceId, { agent: session.agent, persona: session.persona });

  return new Elysia({ name: "@dojofoo/agent-api", prefix: "/api/v1" })
    .error({ AgentApiError })
    .onError(({ code, error, set }) => {
      if (error instanceof AgentApiError) {
        set.status = error.status;
        return { error: error.code, message: error.message };
      }
      if (error instanceof ClientError) {
        set.status = error.status >= 400 && error.status < 500 ? error.status : 502;
        return { error: error.code ?? "agent_error", message: error.message };
      }
      if (code === "VALIDATION") {
        set.status = 400;
        return { error: "invalid_request", message: "The request does not match this operation's schema." };
      }
      if (code === "NOT_FOUND") {
        set.status = 404;
        return { error: "not_found", message: "Not found." };
      }
      set.status = 500;
      return { error: "internal_error", message: error instanceof Error ? error.message : String(error) };
    })

    // Coding agents
    .get("/workspaces/:workspaceId/agents", async ({ params, query }) =>
      paginate(await runtime.agents(params.workspaceId), query), routes.listAgents)
    .get("/workspaces/:workspaceId/agents/:agentId", async ({ params }) => {
      const agent = (await runtime.agents(params.workspaceId)).find(item => item.id === params.agentId);
      if (!agent) throw new AgentApiError(404, "agent_not_found", "This workspace has no such coding agent.");
      return agent;
    }, routes.getAgent)
    .post("/workspaces/:workspaceId/agents/:agentId", async ({ params, set }) => {
      set.status = 202;
      return runtime.start(params.workspaceId, params.agentId);
    }, routes.startAgent)
    .delete("/workspaces/:workspaceId/agents/:agentId", async ({ params, set }) => {
      set.status = 202;
      return runtime.stop(params.workspaceId, params.agentId);
    }, routes.stopAgent)

    // Sessions
    .get("/workspaces/:workspaceId/sessions", async ({ params, query }) => {
      const sessions = (await runtime.sessions.list(params.workspaceId))
        .filter(item => (!query.agent || item.agent === query.agent) && (!query.persona || item.persona === query.persona))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      return paginate(sessions, query);
    }, routes.listSessions)
    .post("/workspaces/:workspaceId/sessions", async ({ params, body, request, set }) => {
      const persona: Persona = body.persona;
      const agents = await runtime.agents(params.workspaceId);
      const agent = body.agent ?? agents.find(item => item.selected)?.id;
      if (!agent || !agents.some(item => item.id === agent)) throw new AgentApiError(404, "agent_not_found", "This workspace has no such coding agent.");
      const client = await runtime.connect(params.workspaceId, { agent, persona });
      // Eve starts the first run on acceptance; the client follows it through `listEvents`.
      const { session } = await client.sessions.create({
        message: body.message ?? runtime.greeting(persona),
        clientContext: await runtime.context?.(params.workspaceId, request),
        signal: request.signal,
      });
      const saved: SessionRecord = { id: session.state.sessionId, agent, persona, createdAt: new Date().toISOString() };
      await runtime.sessions.save(params.workspaceId, saved);
      set.status = 201;
      return { ...saved, status: "running" as const, position: session.state.streamIndex };
    }, routes.createSession)
    .get("/workspaces/:workspaceId/sessions/:sessionId", async ({ params, request }) => {
      const saved = await record(params.workspaceId, params.sessionId);
      const { position, projection, events } = await read(await connect(params.workspaceId, saved), saved.id, request.signal);
      const runId = `${saved.id}:${position}`;
      const pendingInterrupts = eveQuestionInterrupts(projection, runId);
      const conversation = events.reduce(conversationReducer.reduce, conversationReducer.initial());
      const running = Boolean(conversation.activeTurnId && conversation.turns[conversation.activeTurnId]?.status === "active");
      const status = pendingInterrupts.length ? "awaiting-input" as const : running || !events.length ? "running" as const : "idle" as const;
      return {
        ...saved, status, position,
        ...(status === "idle" ? {} : { resume: { threadId: saved.id, runId, pendingInterrupts } }),
      };
    }, routes.getSession)
    .get("/workspaces/:workspaceId/sessions/:sessionId/messages", async ({ params, query, request }) => {
      const saved = await record(params.workspaceId, params.sessionId);
      const { projection } = await read(await connect(params.workspaceId, saved), saved.id, request.signal);
      return paginate(eveChatMessages(projection.messages), query);
    }, routes.listMessages)

    // Runs
    .post("/workspaces/:workspaceId/sessions/:sessionId/runs", async ({ params, body, request }) => {
      const saved = await record(params.workspaceId, params.sessionId);
      const input = await runInput(body);
      const { session, projection } = await read(await connect(params.workspaceId, saved), saved.id, request.signal);
      const options = { signal: request.signal, clientContext: await runtime.context?.(params.workspaceId, request) };
      const events: AsyncIterable<MessageStreamEvent> = input.answers
        ? await session.respond(input.answers, options)
        : await session.send(input.message!, options);
      return toServerSentEventsResponse(streamEveRun({ events, initial: projection, threadId: saved.id, runId: input.runId ?? crypto.randomUUID() }));
    }, routes.createRun)
    .get("/workspaces/:workspaceId/sessions/:sessionId/events", async ({ params, query, request }) => {
      const saved = await record(params.workspaceId, params.sessionId);
      const { session, position, projection, events } = await read(await connect(params.workspaceId, saved), saved.id, request.signal);
      return toServerSentEventsResponse(streamEveRun({
        events: followTurn(session, request.signal, events), initial: projection, attach: true,
        threadId: saved.id, runId: query.runId || `${saved.id}:${position}`,
      }));
    }, routes.listEvents)
    .patch("/workspaces/:workspaceId/sessions/:sessionId/runs/:runId", async ({ params, request, set }) => {
      const saved = await record(params.workspaceId, params.sessionId);
      await (await connect(params.workspaceId, saved)).sessions.attach(saved.id).cancel({ signal: request.signal });
      set.status = 202;
      return { id: params.runId, status: "cancelling" as const };
    }, routes.updateRun);
}

function paginate<T>(items: readonly T[], query: { page?: number; per_page?: number }) {
  const page = query.page ?? 0;
  const perPage = query.per_page ?? 100;
  const offset = page * perPage;
  return {
    data: items.slice(offset, offset + perPage),
    pagination: { page, perPage, total: items.length, hasMore: offset + perPage < items.length },
  };
}
