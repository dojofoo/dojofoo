import { Hono } from "hono";
import { lessonCapabilities, uiCapabilities } from "@dojofoo/protocol";
import { runCoordinator, type RunQuestion } from "./coordinator";

export const runRoutes = new Hono().post("/", async (c) => {
  const authorization = c.req.header("authorization");
  const capability = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!capability) return c.json({ error: "A run capability is required" }, 401);
  const body = await c.req.json<{
    method?: string;
    params?: Partial<RunQuestion> & { fragmentId?: string; observation?: unknown };
  }>();
  try {
    if (body.method === lessonCapabilities.context.method) {
      return c.json({ context: await runCoordinator.context(capability) });
    }
    if (body.method === lessonCapabilities.observe.method) {
      return c.json({ observation: await runCoordinator.observe(capability, body.params?.observation) });
    }
    if (body.method === uiCapabilities.show.method && body.params?.fragmentId) {
      return c.json(await runCoordinator.show(capability, body.params.fragmentId));
    }
    if (body.method !== uiCapabilities.ask.method || !body.params?.title || !body.params.options || body.params.options.length < 2) {
      return c.json({ error: "Invalid run command" }, 422);
    }
    const question = { requestId: crypto.randomUUID(), title: body.params.title, options: body.params.options };
    return c.json({ question, answers: await runCoordinator.ask(capability, question) });
  } catch (cause) {
    return c.json({ error: cause instanceof Error ? cause.message : "Run command failed" }, 409);
  }
});
