import { Client, ClientError } from "@dojofoo/agent/client";
import { Elysia } from "elysia";
import { AgentApiError, type AgentRuntime, type Persona, type SessionRecord } from "./runtime";
import { routes } from "./schema";

export interface AgentApiOptions {
  /** Checks a state-changing request (selecting an agent); throws {@link AgentApiError} to refuse it */
  authorize?(request: Request): void;
}

/**
 * The workspace agent API: coding agents, sessions and runs under `/api/v1`. Mount
 * its `fetch` in any host (Hono's `app.mount`, Elysia's `.mount`, a Worker's
 * `fetch`); the runtime decides where agents actually run. A session's conversation
 * is Eve's own: `useEveAgent` (or `eve/client`) talks to it under the session's URL.
 */
export function createAgentApi(runtime: AgentRuntime, options: AgentApiOptions = {}) {
  const record = async (workspaceId: string, sessionId: string): Promise<SessionRecord> => {
    const session = await runtime.sessions.get(workspaceId, sessionId);
    if (!session) throw new AgentApiError(404, "session_not_found", "Session not found.");
    return session;
  };

  return new Elysia({ name: "@dojofoo/agent-api", prefix: "/api/v1" })
    .error({ AgentApiError })
    .onError(({ code, error, set, request }) => {
      // On a session's Eve routes, in the shape Eve's client reads
      const eve = new URL(request.url).pathname.includes("/eve/");
      const failure = (status: number, code: string, message: string) => {
        set.status = status;
        return eve ? { error: message, code } : { error: code, message };
      };
      if (error instanceof AgentApiError) return failure(error.status, error.code, error.message);
      if (error instanceof ClientError) {
        return failure(error.status >= 400 && error.status < 500 ? error.status : 502, error.code ?? "agent_error", error.message);
      }
      if (code === "VALIDATION") return failure(400, "invalid_request", "The request does not match this operation's schema.");
      if (code === "NOT_FOUND") return failure(404, "not_found", "Not found.");
      return failure(eve ? 502 : 500, eve ? "agent_unreachable" : "internal_error", error instanceof Error ? error.message : String(error));
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
    .post("/workspaces/:workspaceId/agents/:agentId/select", async ({ params, request }) => {
      options.authorize?.(request);
      return runtime.select(params.workspaceId, params.agentId);
    }, routes.selectAgent)

    // Sessions
    .get("/workspaces/:workspaceId/sessions", async ({ params, query }) => {
      const sessions = (await runtime.sessions.list(params.workspaceId))
        .filter(item => (!query.agent || item.agent === query.agent) && (!query.persona || item.persona === query.persona))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      return paginate(sessions, query);
    }, routes.listSessions)
    .post("/workspaces/:workspaceId/sessions", async ({ params, body, request, set }) => {
      // The workspace decides who speaks, not the page
      const persona: Persona = await runtime.persona(params.workspaceId);
      const agents = await runtime.agents(params.workspaceId);
      const agent = body.agent ?? agents.find(item => item.selected)?.id;
      if (!agent || !agents.some(item => item.id === agent)) throw new AgentApiError(404, "agent_not_found", "This workspace has no such coding agent.");
      const client = new Client(await runtime.connect(params.workspaceId, { agent, persona }));
      // Eve starts the first turn on acceptance; the client follows it on the session's stream.
      const { session } = await client.sessions.create({
        message: body.message ?? runtime.greeting(persona),
        ...(body.clientContext ? { clientContext: body.clientContext } : {}),
        signal: request.signal,
      });
      const saved: SessionRecord = { id: session.state.sessionId, agent, persona, createdAt: new Date().toISOString() };
      await runtime.sessions.save(params.workspaceId, saved);
      set.status = 201;
      return saved;
    }, routes.createSession)
    .get("/workspaces/:workspaceId/sessions/:sessionId", async ({ params }) =>
      record(params.workspaceId, params.sessionId), routes.getSession)

    // The session's own Eve routes, for this session only
    .all("/workspaces/:workspaceId/sessions/:sessionId/eve/*", async ({ params, request }) => {
      const saved = await record(params.workspaceId, params.sessionId);
      const path = `/eve/${params["*"]}`;
      const own = `/eve/v1/session/${encodeURIComponent(saved.id)}`;
      // Encoded separators or dot segments could address another route once the host decodes them
      if ((path !== own && !path.startsWith(`${own}/`)) || /%2f|%5c|\\|(^|\/)\.\.?(\/|$)|%2e/iu.test(params["*"])) {
        throw new AgentApiError(404, "not_found", "Not found.");
      }
      const endpoint = await runtime.connect(params.workspaceId, { agent: saved.agent, persona: saved.persona });
      const target = new URL(`${endpoint.baseUrl.replace(/\/$/u, "")}${path}`);
      target.search = new URL(request.url).search;
      const headers = new Headers(endpoint.headers);
      for (const [name, value] of request.headers) {
        if (name === "content-type" || name === "accept" || name.startsWith("x-eve-")) headers.set(name, value);
      }
      const upstream = await fetch(target, {
        method: request.method, headers, signal: request.signal, redirect: "manual",
        ...(request.method === "GET" || request.method === "HEAD" ? {} : { body: await request.arrayBuffer() }),
      });
      const returned = new Headers();
      for (const [name, value] of upstream.headers) {
        if (name === "content-type" || name === "cache-control" || name.startsWith("x-eve-")) returned.set(name, value);
      }
      return new Response(upstream.body, { status: upstream.status, headers: returned });
    }, routes.eve);
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
