import { Hono } from "hono";
import {
  advanceLesson,
  checkLesson,
  courseView,
  readLesson,
  readLessonFile,
  writeLessonFile,
} from "./service";
import { getTypeScriptCompletions, getTypeScriptDiagnostics, getTypeScriptHover } from "./typescript-language-service";
import { resolveWorkspaceId } from "../control/workspace";
import { readCourseManifest, readDojoRc, writeDojoRc } from "@dojofoo/config";
import { requestOrigin } from "../request-origin";
import { advanceInteractiveLesson, getInteractiveLesson } from "../interactive/service";
import { dropHeld, offerCheckReport } from "../agent-session/check-reports";
import { readRecords } from "../agent-session/records";
import { localAgentRuntime } from "../agent-api";

const app = new Hono();

function context(c: { req: { param(name: string): string } }) {
  return {
    root: resolveWorkspaceId(c.req.param("workspaceId")),
    courseId: c.req.param("courseId"),
    lessonId: c.req.param("lessonId"),
  };
}

function assertCourse(actual: string, requested: string): void {
  if (actual !== requested) throw new Error(`Course not found: ${requested}`);
}

app.get("/:workspaceId/courses/:courseId/lessons/:lessonId", async (c) => {
  const { root, courseId, lessonId } = context(c);
  // `?prepare` is still accepted and means nothing: no read opens a conversation (decision 28)
  const lesson = await readLesson(root, courseId, lessonId);
  if (!lesson) return c.json({ error: "Lesson not found" }, 404);
  assertCourse(lesson.dojo, courseId);
  return c.json(lesson);
});

// "Make this my current course": the only web write of `currentDojo` (D30), with the course's last active lesson
app.post("/:workspaceId/courses/:courseId/current", (c) => {
  // It writes .dojorc, so a foreign page may not call it, as the control routes' writes
  const origin = c.req.header("Origin");
  if (origin && origin !== requestOrigin(c.req.raw)) return c.json({ error: "Same-origin requests only." }, 403);
  const root = resolveWorkspaceId(c.req.param("workspaceId"));
  writeDojoRc(root, courseView(readDojoRc(root), c.req.param("courseId")));
  return c.body(null, 204);
});

app.get("/:workspaceId/courses/:courseId/lessons/:lessonId/checks", async (c) => {
  const { root, courseId, lessonId } = context(c);
  const lesson = await readLesson(root, courseId, lessonId);
  if (!lesson) return c.json({ error: "Lesson not found" }, 404);
  assertCourse(lesson.dojo, courseId);
  return c.json({
    data: lesson.result ? [{ type: "checks", id: "latest", attributes: lesson.result }] : [],
  });
});

app.get("/:workspaceId/courses/:courseId/lessons/:lessonId/files/:fileId", async (c) => {
  const { root, courseId, lessonId } = context(c);
  return c.json(await readLessonFile(root, courseId, lessonId, c.req.param("fileId")));
});

app.put("/:workspaceId/courses/:courseId/lessons/:lessonId/files/:fileId", async (c) => {
  const { root, courseId, lessonId } = context(c);
  const body = await c.req.json<{ content: string }>();
  const written = await writeLessonFile(root, courseId, lessonId, c.req.param("fileId"), body.content);
  // A save makes a report Sensei has not been sent stale (D16)
  for (const record of (await readRecords(root)).filter(item => item.courseId === courseId && item.lessonId === lessonId)) {
    await dropHeld(root, c.req.param("workspaceId"), record.id);
  }
  return c.json(written);
});

app.post("/:workspaceId/courses/:courseId/lessons/:lessonId/checks", async (c) => {
  try {
    const { root, courseId, lessonId } = context(c);
    const { lesson, observation } = await checkLesson(root, courseId, lessonId);
    await offerCheckReport(localAgentRuntime, { path: root, workspaceId: c.req.param("workspaceId") }, courseId, lessonId, observation);
    return c.json({
      data: {
        type: "checks",
        id: crypto.randomUUID(),
        attributes: lesson.result,
        relationships: {
          lesson: { data: { type: "lessons", id: lessonId } },
        },
        meta: { observation },
      },
    }, 201);
  } catch (cause) {
    return c.json({ error: cause instanceof Error ? cause.message : "Could not run the lesson checks." }, 500);
  }
});

app.post("/:workspaceId/courses/:courseId/lessons/:lessonId/progressions", async (c) => {
  try {
    const { root, courseId, lessonId } = context(c);
    if (readCourseManifest(root, courseId).mode === "interactive") {
      const current = getInteractiveLesson(root, courseId);
      if (current.current?.id !== lessonId) return c.json({ error: "This is not the current interactive step." }, 409);
      return c.json(advanceInteractiveLesson(root, courseId));
    }
    // "Open next lesson" (D25's fallback) and Sensei's Move on share one step, for any course
    return c.json(await advanceLesson(root, courseId, lessonId));
  } catch (cause) {
    return c.json({ error: cause instanceof Error ? cause.message : "Could not continue the course" }, 409);
  }
});

app.post("/:workspaceId/courses/:courseId/lessons/:lessonId/files/:fileId/diagnostics", async (c) => {
  const { root } = context(c);
  const body = await c.req.json<{ code: string; filePath: string }>();
  return c.json(getTypeScriptDiagnostics({ ...body, projectRoot: root }));
});

app.post("/:workspaceId/courses/:courseId/lessons/:lessonId/files/:fileId/completions", async (c) => {
  const { root } = context(c);
  const body = await c.req.json<{ code: string; filePath: string; position: number }>();
  return c.json(getTypeScriptCompletions({ ...body, projectRoot: root }));
});

app.post("/:workspaceId/courses/:courseId/lessons/:lessonId/files/:fileId/hover", async (c) => {
  const { root } = context(c);
  const body = await c.req.json<{ code: string; filePath: string; position: number }>();
  return c.json(getTypeScriptHover({ ...body, projectRoot: root }));
});

export { app as lessonRoutes };
export type LessonRoutes = typeof app;
