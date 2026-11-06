import { ClientError } from "@dojofoo/harness/client";
import { Elysia } from "elysia";
import { classifyEveRequest } from "./delivery";
import { AgentApiError, type AgentRuntime, type SessionRecord } from "./runtime";
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

  return new Elysia({ name: "@dojofoo/harness/api", prefix: "/api/v1" })
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
    .get("/workspaces/:workspaceId/agents/:agentId/models", async ({ params, query }) =>
      paginate(await runtime.models(params.workspaceId, params.agentId), query), routes.listModels)

    // Sessions
    .get("/workspaces/:workspaceId/sessions", async ({ params, query }) => {
      const sessions = (await runtime.sessions.list(params.workspaceId))
        .filter(item => (!query.agent || item.agent === query.agent) && (!query.persona || item.persona === query.persona)
          && (query.course === undefined || item.courseId === query.course) && (query.lesson === undefined || (item.lessonId ?? "") === query.lesson))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      return paginate(sessions, query);
    }, routes.listSessions)
    // The second token-checked route: only the UI's own pages open their default conversation
    .post("/workspaces/:workspaceId/sessions/default", async ({ params, body, request }) => {
      options.authorize?.(request);
      return runtime.sessions.openDefault(params.workspaceId, body);
    }, routes.openDefaultSession)
    .get("/workspaces/:workspaceId/sessions/:sessionId", async ({ params }) =>
      record(params.workspaceId, params.sessionId), routes.getSession)
    .patch("/workspaces/:workspaceId/sessions/:sessionId", async ({ params, body }) =>
      runtime.sessions.patch(params.workspaceId, params.sessionId, { ...(body.model ? { model: body.model } : {}), ...(body.effort !== undefined ? { effort: body.effort } : {}) }), routes.updateSession)

    // The session's own Eve routes, for this session only
    .all("/workspaces/:workspaceId/sessions/:sessionId/eve/*", async ({ params, request }) => {
      const saved = await record(params.workspaceId, params.sessionId);
      const path = `/eve/${params["*"]}`;
      const own = `/eve/v1/session/${encodeURIComponent(saved.id)}`;
      // Encoded separators or dot segments could address another route once the host decodes them
      if ((path !== own && !path.startsWith(`${own}/`)) || /%2f|%5c|\\|(^|\/)\.\.?(\/|$)|%2e/iu.test(params["*"])) {
        throw new AgentApiError(404, "not_found", "Not found.");
      }
      // Every proxied request counts as presence; an open stream until its body ends
      const releaseRequest = runtime.activity?.(params.workspaceId, "request");
      try {
        const endpoint = await runtime.connect(params.workspaceId, { agent: saved.agent, persona: saved.persona });
        const target = new URL(`${endpoint.baseUrl.replace(/\/$/u, "")}${path}`);
        target.search = new URL(request.url).search;
        const headers = new Headers(endpoint.headers);
        for (const [name, value] of request.headers) {
          if (name === "content-type" || name === "accept" || name.startsWith("x-eve-")) headers.set(name, value);
        }
        const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
        const parsed = body?.byteLength ? (() => { try { return JSON.parse(new TextDecoder().decode(body)); } catch { return Symbol.for("invalid"); } })() : undefined;
        const classified = classifyEveRequest(request.method, path.slice("/eve".length), parsed);
        // A check report or a begin turn must never be cleared away, and Sensei keeps its whole conversation (D16)
        if (saved.persona === "sensei" && classified.kind === "control" && (classified.control === "clear" || classified.control === "compact")) {
          throw new AgentApiError(409, "control_refused", "Sensei's conversations can't be cleared or compacted.");
        }
        const delivery = classified.kind === "delivery" ? classified.delivery : undefined;
        const handle = delivery ? await runtime.deliveries?.before(params.workspaceId, saved, delivery) : undefined;
        let upstream: Response;
        try {
          upstream = await fetch(target, { method: request.method, headers, signal: request.signal, redirect: "manual", ...(body ? { body } : {}) });
        } catch (error) {
          if (delivery) await runtime.deliveries?.after(params.workspaceId, saved, delivery, { handle, status: 502 });
          throw error;
        }
        if (delivery) {
          // Eve answers an accepted delivery with 202 { ok, sessionId, deliveryId }
          const deliveryId = upstream.status === 202
            ? await upstream.clone().json().then((answer: { deliveryId?: unknown }) => typeof answer.deliveryId === "string" ? answer.deliveryId : undefined, () => undefined)
            : undefined;
          await runtime.deliveries?.after(params.workspaceId, saved, delivery, { handle, status: upstream.status, ...(deliveryId ? { deliveryId } : {}) });
        }
        const returned = new Headers();
        for (const [name, value] of upstream.headers) {
          if (name === "content-type" || name === "cache-control" || name.startsWith("x-eve-")) returned.set(name, value);
        }
        const releaseStream = classified.kind === "read" && upstream.body ? runtime.activity?.(params.workspaceId, "stream") : undefined;
        const streamed = releaseStream && upstream.body ? upstream.body.pipeThrough(new TransformStream({ flush: () => releaseStream() })) : upstream.body;
        if (releaseStream) request.signal.addEventListener("abort", releaseStream, { once: true });
        return new Response(streamed, { status: upstream.status, headers: returned });
      } finally {
        releaseRequest?.();
      }
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
