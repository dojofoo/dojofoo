import { Hono } from "hono";
import type { Context } from "hono";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, extname, relative, resolve } from "node:path";
import { dojoDir, readDojoRc } from "@dojofoo/config";
import { observeWorkspacePath } from "@dojofoo/config/local-state";
import { resolveRequestWorkspace, resolveWorkspaceId } from "../control/workspace";
import { answerInteractiveQuestion, getInteractiveLesson, selectInteractiveMaterial } from "./service";

const root = (c: Context) => c.req.param("workspaceId")
  ? resolveWorkspaceId(c.req.param("workspaceId")!) : resolveRequestWorkspace(c.req.raw);
const course = (c: Context) => c.req.param("courseId") ?? c.req.query("course");
const target = (c: Context) => getInteractiveLesson(root(c), course(c)).dojo;

export const interactiveRoutes = new Hono()
  .get("/", (c) => c.json({ ...getInteractiveLesson(root(c), course(c)), workspaceId: observeWorkspacePath(root(c)) }))
  .put("/material", async c => {
    const body = await c.req.json<{ lessonId?: string; slideId?: string }>();
    if ((!body.lessonId && !body.slideId) || Object.keys(body).some(key => key !== "lessonId" && key !== "slideId")
      || body.lessonId !== undefined && typeof body.lessonId !== "string" || body.slideId !== undefined && typeof body.slideId !== "string") {
      return c.json({ error: "Choose a lesson or slide." }, 422);
    }
    try { return c.json(selectInteractiveMaterial(root(c), body, course(c))); }
    catch (cause) { return c.json({ error: cause instanceof Error ? cause.message : String(cause) }, 409); }
  })
  .post("/answer", async (c) => {
    const body = await c.req.json<{ answer?: string }>();
    if (typeof body.answer !== "string" || !body.answer.trim()) return c.json({ error: "An answer is required." }, 400);
    return c.json(answerInteractiveQuestion(root(c), body.answer, course(c)));
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
      headers["cache-control"] = "private, no-cache";
      headers["content-security-policy"] = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src 'none'; connect-src 'none'";
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
