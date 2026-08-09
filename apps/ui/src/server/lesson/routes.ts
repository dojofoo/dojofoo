import { resolve } from "node:path";
import { findProjectRoot } from "@dojocho/config";
import { Hono } from "hono";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import {
  answerSenseiQuestion,
  checkSolution,
  getAgentActivity,
  getLesson,
  nextLesson,
  resetSolution,
  saveSolution,
  startLesson,
  streamSensei,
} from "./service";

const root = () => resolve(process.env.DOJO_PROJECT_ROOT ?? findProjectRoot());

const app = new Hono()
  .get("/", async (c) => c.json(await getLesson(root())))
  .get("/activity", async (c) => c.json(await getAgentActivity(root(), c.req.query("kata"))))
  .post("/start", async (c) => c.json(await startLesson(root())))
  .post("/chat", async (c) => {
    const body = await c.req.json<{ kata?: string; message: string }>();
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const textId = crypto.randomUUID();
        writer.write({ type: "start", messageId: crypto.randomUUID() });
        writer.write({ type: "text-start", id: textId });
        await streamSensei(root(), body.kata, body.message, (delta) => {
          writer.write({ type: "text-delta", id: textId, delta });
        });
        writer.write({ type: "text-end", id: textId });
        writer.write({ type: "finish" });
      },
      onError: (cause) => cause instanceof Error ? cause.message : "Codex chat failed",
    });
    return createUIMessageStreamResponse({ stream });
  })
  .post("/tool-response", async (c) => {
    const body = await c.req.json<{ kata?: string; answers: Record<string, string[]> }>();
    return c.json(await answerSenseiQuestion(root(), body.kata, body.answers));
  })
  .post("/solution", async (c) => {
    const body = await c.req.json<{ code: string }>();
    return c.json(await saveSolution(root(), body.code));
  })
  .post("/reset", async (c) => c.json(await resetSolution(root())))
  .post("/check", async (c) => {
    const body = await c.req.json<{ code: string }>();
    return c.json(await checkSolution(root(), body.code));
  })
  .post("/next", async (c) => c.json(await nextLesson(root())))
  .get("/:kata", async (c) => c.json(await getLesson(root(), c.req.param("kata"))));

export { app as lessonRoutes };
export type LessonRoutes = typeof app;
