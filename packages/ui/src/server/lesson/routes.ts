import { Hono } from "hono";
import { chatParamsFromRequestBody, toServerSentEventsResponse, type UIMessage as TanStackUIMessage } from "@tanstack/ai";
import {
  answerSenseiQuestion,
  checkLesson,
  getLesson,
  nextLesson,
  readLessonFile,
  setLessonModel,
  startLessonSession,
  streamLessonIntroduction,
  streamCheckObservation,
  streamSensei,
  writeLessonFile,
} from "./service";
import { getTypeScriptCompletions, getTypeScriptDiagnostics, getTypeScriptHover } from "./typescript-language-service";
import { resolveWorkspaceId } from "../control/workspace";
import type { AcpStreamPart } from "./codex-client";
import { streamAcpAsAgUi } from "./agui-stream";

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
  const lesson = await getLesson(root, lessonId);
  if (!lesson) return c.json({ error: "Lesson not found" }, 404);
  assertCourse(lesson.dojo, courseId);
  return c.json(lesson);
});

app.get("/:workspaceId/courses/:courseId/lessons/:lessonId/messages", async (c) => {
  const { root, courseId, lessonId } = context(c);
  const lesson = await getLesson(root, lessonId);
  if (!lesson) return c.json({ error: "Lesson not found" }, 404);
  assertCourse(lesson.dojo, courseId);
  return c.json({
    data: lesson.messages,
  });
});

app.post("/:workspaceId/courses/:courseId/lessons/:lessonId/sessions", async (c) => {
  try {
    const { root, courseId, lessonId } = context(c);
    const lesson = await getLesson(root, lessonId);
    if (!lesson) return c.json({ error: "Lesson not found" }, 404);
    assertCourse(lesson.dojo, courseId);
    return c.json(await startLessonSession(root, lessonId), 201);
  } catch (cause) {
    return c.json({ error: cause instanceof Error ? cause.message : "Could not start a new lesson session" }, 502);
  }
});

app.put("/:workspaceId/courses/:courseId/lessons/:lessonId/configuration/model", async (c) => {
  const { root, courseId, lessonId } = context(c);
  const lesson = await getLesson(root, lessonId);
  if (!lesson) return c.json({ error: "Lesson not found" }, 404);
  assertCourse(lesson.dojo, courseId);
  const body = await c.req.json<{ value?: string }>();
  if (!body.value?.trim()) return c.json({ error: "Model value is required" }, 422);
  try {
    return c.json(await setLessonModel(root, lessonId, body.value));
  } catch (cause) {
    return c.json({ error: cause instanceof Error ? cause.message : "Could not change the harness model" }, 502);
  }
});

app.get("/:workspaceId/courses/:courseId/lessons/:lessonId/checks", async (c) => {
  const { root, courseId, lessonId } = context(c);
  const lesson = await getLesson(root, lessonId);
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
  return c.json(await writeLessonFile(root, courseId, lessonId, c.req.param("fileId"), body.content));
});

app.post("/:workspaceId/courses/:courseId/lessons/:lessonId/checks", async (c) => {
  try {
    const { root, courseId, lessonId } = context(c);
    const { lesson, observation } = await checkLesson(root, courseId, lessonId);
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
    const lesson = await getLesson(root, lessonId);
    if (!lesson) return c.json({ error: "Lesson not found" }, 404);
    assertCourse(lesson.dojo, courseId);
    if (!lesson.result?.complete && lesson.state !== "completed") {
      return c.json({ error: "Complete the current lesson before moving on" }, 409);
    }
    return c.json(await nextLesson(root));
  } catch (cause) {
    return c.json({ error: cause instanceof Error ? cause.message : "Could not continue the course" }, 409);
  }
});

app.post("/:workspaceId/courses/:courseId/lessons/:lessonId/messages", async (c) => {
  const { root, courseId, lessonId } = context(c);
  const lesson = await getLesson(root, lessonId);
  if (!lesson) return c.json({ error: "Lesson not found" }, 404);
  assertCourse(lesson.dojo, courseId);
  const rawBody = await c.req.json<unknown>();
  if (rawBody && typeof rawBody === "object" && "answers" in rawBody) {
    const answers = (rawBody as { answers?: Record<string, string[]> }).answers;
    if (answers) return c.json(await answerSenseiQuestion(root, lessonId, answers), 201);
  }
  const params = await chatParamsFromRequestBody(rawBody);
  const forwarded = params.forwardedProps as {
    kind?: "check-observation" | "introduction" | "text";
    message?: string;
    answers?: Record<string, string[]>;
    observation?: import("./service").CheckObservation;
  };
  const body = {
    ...forwarded,
    message: forwarded.message ?? latestUserText(params.messages as TanStackUIMessage[]),
  };
  if (body.kind === "check-observation" && !body.observation) {
    return c.json({ error: "Check observation is required" }, 422);
  }
  if (body.kind !== "introduction" && body.kind !== "check-observation" && !body.message?.trim()) {
    return c.json({ error: "Message content is required" }, 422);
  }

  const stream = streamAcpAsAgUi({
    threadId: params.threadId,
    runId: params.runId,
    execute: async (onPart: (part: AcpStreamPart) => void) => {
      if (body.kind === "introduction") {
        await streamLessonIntroduction(root, lessonId, onPart, c.req.raw.signal);
      } else if (body.kind === "check-observation" && body.observation) {
        await streamCheckObservation(root, lessonId, body.observation, onPart, c.req.raw.signal);
      } else {
        await streamSensei(root, lessonId, body.message!, onPart, c.req.raw.signal);
      }
    },
  });
  return toServerSentEventsResponse(stream);
});

function latestUserText(messages: TanStackUIMessage[]): string {
  const message = messages.findLast((candidate) => candidate.role === "user");
  return message?.parts.flatMap((part) => part.type === "text" ? [part.content] : []).join("") ?? "";
}

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
