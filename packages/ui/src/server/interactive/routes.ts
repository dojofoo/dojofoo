import { Hono } from "hono";
import type { Context } from "hono";
import { chatParamsFromRequestBody, convertMessagesToModelMessages, toServerSentEventsResponse } from "@tanstack/ai";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, extname, relative, resolve } from "node:path";
import { dojoDir, readDojoRc } from "@dojofoo/config";
import { resolveRequestWorkspace, resolveWorkspaceId } from "../control/workspace";
import { advanceInteractiveLesson, answerInteractiveQuestion, getInteractiveLesson } from "./service";
import { answerInteractiveSensei, getInteractiveConversation, selectInteractiveHarness, setInteractiveModel, streamInteractiveSensei } from "./conversation";
import { dojofooHarness, lessonHarnesses } from "../harness/registry";
import { streamAcpAsAgUi } from "../lesson/agui-stream";

const root = (c: Context) => c.req.param("workspaceId")
  ? resolveWorkspaceId(c.req.param("workspaceId")!) : resolveRequestWorkspace(c.req.raw);
const course = (c: Context) => c.req.param("courseId") ?? c.req.query("course");
const target = (c: Context) => getInteractiveLesson(root(c), course(c)).dojo;

export const interactiveRoutes = new Hono()
  .get("/", (c) => c.json(getInteractiveLesson(root(c), course(c))))
  .post("/answer", async (c) => {
    const body = await c.req.json<{ answer?: string }>();
    if (typeof body.answer !== "string" || !body.answer.trim()) return c.json({ error: "An answer is required." }, 400);
    return c.json(answerInteractiveQuestion(root(c), body.answer, course(c)));
  })
  .post("/advance", (c) => c.json(advanceInteractiveLesson(root(c), course(c))))
  .get("/conversation", async c => c.json(await getInteractiveConversation(root(c), target(c))))
  .put("/configuration/harness", async c => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: "Select a supported coding agent." }, 422); }
    if (!body || typeof body !== "object" || !("harness" in body) || typeof body.harness !== "string" || !body.harness.trim() || Object.keys(body).some(key => key !== "harness")) return c.json({ error: "Select a supported coding agent." }, 422);
    try {
      const harness = dojofooHarness({ DOJOFOO_HARNESS: body.harness });
      if (!lessonHarnesses.includes(harness)) throw new Error("Select a supported coding agent.");
    }
    catch (cause) { return c.json({ error: cause instanceof Error ? cause.message : String(cause) }, 422); }
    try { return c.json(await selectInteractiveHarness(root(c), target(c), body.harness)); }
    catch (cause) { return c.json({ error: cause instanceof Error ? cause.message : String(cause) }, 502); }
  })
  .put("/configuration/model", async c => {
    const body = await c.req.json<{ value?: string }>();
    if (!body.value?.trim()) return c.json({ error: "Model value is required" }, 422);
    return c.json(await setInteractiveModel(root(c), target(c), body.value));
  })
  .post("/messages", async c => {
    const projectRoot = root(c);
    const dojo = target(c);
    const raw = await c.req.json();
    if (raw?.answers) {
      answerInteractiveSensei(projectRoot, dojo, raw.answers);
      return c.json({ ok: true }, 201);
    }
    const params = await chatParamsFromRequestBody(raw);
    const last = convertMessagesToModelMessages(params.messages).findLast(message => message.role === "user")?.content;
    const message = typeof last === "string" ? last : last?.flatMap(part => part.type === "text" ? [part.content] : []).join("") ?? "";
    if (!message.trim()) return c.json({ error: "Message content is required" }, 422);
    return toServerSentEventsResponse(streamAcpAsAgUi({
      threadId: params.threadId, runId: params.runId,
      execute: onPart => streamInteractiveSensei(projectRoot, dojo, message, onPart, c.req.raw.signal),
    }));
  })
  .get("/asset", (c) => {
    const workspaceId = c.req.query("workspace");
    const projectRoot = c.req.param("workspaceId") ? root(c) : workspaceId ? resolveWorkspaceId(workspaceId) : root(c);
    const requested = c.req.query("path");
    if (!requested) return c.json({ error: "An asset path is required." }, 400);
    const rc = readDojoRc(projectRoot);
    const courseRoot = realpathSync(dojoDir(projectRoot, course(c) ?? rc.currentDojo));
    const unresolved = resolve(courseRoot, requested);
    if (!existsSync(unresolved)) return c.json({ error: "Asset not found." }, 404);
    const path = realpathSync(unresolved);
    const relativePath = relative(courseRoot, path);
    const assetStat = statSync(path);
    if (relativePath.startsWith("..") || relativePath === "" || !assetStat.isFile() || assetStat.size > 100 * 1024 * 1024) {
      return c.json({ error: "Asset is outside the active dojo or too large." }, 403);
    }
    const headers: Record<string, string> = {
        "content-type": contentType(extname(path)),
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
    };
    if (c.req.query("download") === "1") headers["content-disposition"] = `attachment; filename="${basename(path).replaceAll('"', "")}"`;
    if (extname(path).toLocaleLowerCase() === ".html") {
      headers["content-security-policy"] = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; media-src 'none'; connect-src 'none'";
    }
    return new Response(readFileSync(path), {
      headers,
    });
  });

function contentType(extension: string): string {
  return ({
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".js": "text/javascript",
    ".css": "text/css",
    ".html": "text/html; charset=utf-8",
  } as Record<string, string>)[extension.toLocaleLowerCase()] ?? "application/octet-stream";
}
