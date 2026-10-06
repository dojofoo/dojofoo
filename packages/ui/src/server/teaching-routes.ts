import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { compileTeachingDocument } from "./teaching-markdown";

export const teachingRoutes = new Hono()
  .use("*", bodyLimit({ maxSize: 256 * 1024 }))
  .post("/preview", async (c) => {
    const origin = c.req.header("Origin");
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: "Same-origin requests only." }, 403);
    const body = await c.req.json().catch(() => null);
    if (typeof body?.source !== "string") return c.json({ error: "Markdown source is required." }, 400);
    if ((body.basePath != null && typeof body.basePath !== "string") || (body.workspaceId != null && typeof body.workspaceId !== "string")) return c.json({ error: "Invalid asset context." }, 400);
    try {
      return c.json({ blocks: await compileTeachingDocument(body.source, { basePath: body.basePath ?? null, workspaceId: body.workspaceId ?? "" }) });
    } catch (cause) {
      return c.json({ error: cause instanceof Error ? cause.message : "Unable to render lesson content." }, 422);
    }
  });
