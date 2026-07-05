import { Hono } from "hono";
import {
  DefaultRequestHandler,
  DefaultExecutionEventBusManager,
  InMemoryTaskStore,
} from "@a2a-js/sdk/server";

import { buildAgentCard } from "./agent-card";
import { EchoExecutor } from "./executor";
import { honoAgentCardHandler } from "./a2a/agent-card";
import { honoJsonRpcHandler } from "./a2a/jsonrpc";
import { projectRoutes } from "./project/routes";

/**
 * Construct the Hono app that owns all A2A routes.
 *
 * Mounted into TanStack Start via `src/routes/api/$.ts` and
 * `src/routes/.well-known/agent-card.json.ts` — both delegate to
 * `app.fetch(request)`.
 */
function buildApp() {
  // Resolve the agent card lazily so it picks up the request's host. The
  // pattern below assumes single-host dev (localhost:4567); a reverse
  // proxy / production deploy can swap to reading the forwarded headers.
  const baseUrl = process.env.DOJO_UI_BASE_URL || "http://localhost:4567";
  const agentCard = buildAgentCard({ baseUrl });

  const taskStore = new InMemoryTaskStore();
  const executor = new EchoExecutor();
  const eventBusManager = new DefaultExecutionEventBusManager();
  const requestHandler = new DefaultRequestHandler(
    agentCard,
    taskStore,
    executor,
    eventBusManager,
  );

  const app = new Hono();

  // Same-origin browser access only. Project APIs expose local journals and
  // cassettes, so never reflect arbitrary web origins.
  app.use("*", async (c, next) => {
    const origin = c.req.header("Origin");
    const selfOrigin = new URL(c.req.url).origin;
    const allowOrigin = origin === selfOrigin ? origin : null;

    if (c.req.method === "OPTIONS") {
      const headers: Record<string, string> = {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      };
      if (allowOrigin) headers["Access-Control-Allow-Origin"] = allowOrigin;

      return new Response(null, {
        status: 204,
        headers,
      });
    }

    await next();
    if (allowOrigin) c.res.headers.set("Access-Control-Allow-Origin", allowOrigin);
  });

  // Liveness.
  app.get("/api/health", (c) => c.json({ ok: true, version: agentCard.version }));

  // Local learner project API.
  app.route("/api/project", projectRoutes);

  // A2A endpoints.
  app.get("/.well-known/agent-card.json", honoAgentCardHandler(requestHandler));
  app.post("/api/a2a/jsonrpc", honoJsonRpcHandler(requestHandler));

  return app;
}

export const app = buildApp();
