import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { Hono } from "hono";
import {
  createAuthoringService,
  createAuthoringLesson,
  createLessonTrial,
  authoringEvalReadiness,
  renameAuthoringCourse,
  renameAuthoringLesson,
  readAuthoringDraft,
} from "./service";
import { readAuthoringFile, writeAuthoringFile } from "./files";
import type { AuthoringAgent, AuthoringStreamPart } from "./types";

const executeFile = promisify(execFile);

export type AuthoringEvalReport = {
  version: 1;
  teachingStyle: string;
  harness: string;
  generatedAt: string;
  score: number;
  lessons: Array<{
    id: string;
    score: number;
    scenarios: Array<{
      scenarioId: string;
      score: number;
      response: string;
      durationMs: number;
      assertions: Array<{ name: string; passed: boolean; evidence?: string }>;
    }>;
  }>;
};

export type AuthoringRouteDependencies = {
  agent: AuthoringAgent;
  resolveWorkspace(request: Request): string;
  stream(input: {
    execute(onPart: (part: AuthoringStreamPart) => void): Promise<void>;
    runId: string;
    threadId: string;
  }): Response;
};

export function createAuthoringRoutes(dependencies: AuthoringRouteDependencies) {
  const service = createAuthoringService(dependencies.agent);
  return new Hono()
  .onError((error, c) => c.json({ error: errorMessage(error) }, 500))
  .get("/draft", (c) => c.json(readAuthoringDraft(dependencies.resolveWorkspace(c.req.raw))))
  .get("/workspace", async (c) =>
    c.json(await service.getWorkspace(dependencies.resolveWorkspace(c.req.raw))))
  .post("/session", async (c) =>
    c.json(await service.startSession(dependencies.resolveWorkspace(c.req.raw)), 201))
  .post("/introduction", (c) => {
    const root = dependencies.resolveWorkspace(c.req.raw);
    const runId = crypto.randomUUID();
    return dependencies.stream({
      runId,
      threadId: `kyoshi:${runId}`,
      execute: (onPart) => service.streamIntroduction(
        root,
        onPart,
        c.req.raw.signal
      ),
    });
  })
  .post("/messages", async (c) => {
    const input = await c.req.json<Record<string, unknown>>();
    const message = authorMessage(input);
    if (!message) return c.json({ error: "Message is required" }, 422);
    const root = dependencies.resolveWorkspace(c.req.raw);
    const runId = crypto.randomUUID();
    return dependencies.stream({
      runId,
      threadId: `kyoshi:${runId}`,
      execute: (onPart) => service.streamMessage(
        root,
        message,
        onPart,
        c.req.raw.signal
      ),
    });
  })
  .post("/answers", async (c) => {
    try {
      const input = await c.req.json<{ answers?: Record<string, string[]> }>();
      if (!input.answers || typeof input.answers !== "object") {
        return c.json({ error: "Answers are required" }, 422);
      }
      await service.answer(dependencies.resolveWorkspace(c.req.raw), input.answers);
      return c.json({ ok: true });
    } catch (cause) {
      return c.json({ error: errorMessage(cause) }, 409);
    }
  })
  .post("/lessons", async (c) => {
    try {
      const input: { title?: unknown } = await c.req
        .json<{ title?: unknown }>()
        .catch(() => ({}));
      const root = dependencies.resolveWorkspace(c.req.raw);
      const lessonId = createAuthoringLesson(
        root,
        typeof input.title === "string" ? input.title : "Untitled lesson"
      );
      return c.json({ lessonId, workspace: readAuthoringDraft(root) }, 201);
    } catch (cause) {
      return c.json({ error: errorMessage(cause) }, 422);
    }
  })
  .patch("/course", async (c) => {
    try {
      const input = await c.req.json<{ title?: unknown }>();
      if (typeof input.title !== "string" || !input.title.trim()) {
        return c.json({ error: "Course title is required" }, 422);
      }
      const root = dependencies.resolveWorkspace(c.req.raw);
      renameAuthoringCourse(root, input.title);
      return c.json(readAuthoringDraft(root));
    } catch (cause) {
      return c.json({ error: errorMessage(cause) }, 422);
    }
  })
  .patch("/lessons/:lessonId", async (c) => {
    try {
      const input = await c.req.json<{ title?: unknown }>();
      if (typeof input.title !== "string" || !input.title.trim()) {
        return c.json({ error: "Lesson title is required" }, 422);
      }
      const root = dependencies.resolveWorkspace(c.req.raw);
      renameAuthoringLesson(root, c.req.param("lessonId"), input.title);
      return c.json(readAuthoringDraft(root));
    } catch (cause) {
      return c.json({ error: errorMessage(cause) }, 422);
    }
  })
  .get("/files/:path{.+}", (c) => {
    try {
      return c.json(readAuthoringFile(
        dependencies.resolveWorkspace(c.req.raw),
        c.req.param("path")
      ));
    } catch (cause) {
      return c.json({ error: errorMessage(cause) }, 422);
    }
  })
  .put("/files/:path{.+}", async (c) => {
    try {
      const input = await c.req.json<{ content?: unknown }>();
      if (typeof input.content !== "string") {
        return c.json({ error: "File content is required" }, 422);
      }
      const root = dependencies.resolveWorkspace(c.req.raw);
      writeAuthoringFile(root, c.req.param("path"), input.content);
      return c.json(readAuthoringDraft(root));
    } catch (cause) {
      return c.json({ error: errorMessage(cause) }, 422);
    }
  })
  .post("/lessons/:lessonId/trials", (c) =>
    c.json(createLessonTrial(
      dependencies.resolveWorkspace(c.req.raw),
      c.req.param("lessonId")
    ), 201))
  .get("/report", async (c) => {
    const root = dependencies.resolveWorkspace(c.req.raw);
    const report = await readReport(root);
    return report
      ? c.json({ root, report })
      : c.json({ root, report: null });
  })
  .post("/evals", async (c) => {
    const root = dependencies.resolveWorkspace(c.req.raw);
    const missing = authoringEvalReadiness(root).filter(({ ready }) => !ready);
    if (missing.length > 0) {
      return c.json({
        error: "The draft is not ready to evaluate.",
        missing,
      }, 409);
    }
    const input: { harness?: "cassette" | "opencode" } = await c.req
      .json<{ harness?: "cassette" | "opencode" }>()
      .catch(() => ({}));
    const harness = input.harness ?? "cassette";
    if (!existsSync(resolve(root, "scripts", "eval.ts"))) {
      return c.json({ error: `No authored eval runner found in ${root}` }, 404);
    }
    if (!existsSync(resolve(root, "node_modules"))) {
      await executeFile("pnpm", ["install", "--ignore-workspace"], {
        cwd: root,
        env: process.env,
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });
    }
    await executeFile("pnpm", ["eval", "--", `--harness=${harness}`], {
      cwd: root,
      env: process.env,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const report = await readReport(root);
    if (!report) return c.json({ error: "Eval completed without a report" }, 500);
    return c.json({ root, report });
  });
}

function authorMessage(input: Record<string, unknown>): string | null {
  if (typeof input.message === "string" && input.message.trim()) return input.message.trim();
  const forwarded = input.forwardedProps;
  if (forwarded && typeof forwarded === "object") {
    const message = (forwarded as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const latest = messages.at(-1);
  if (!latest || typeof latest !== "object") return null;
  const parts = Array.isArray((latest as Record<string, unknown>).parts)
    ? (latest as { parts: unknown[] }).parts
    : [];
  const text = parts.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const value = part as Record<string, unknown>;
    return value.type === "text" && typeof value.content === "string" ? [value.content] : [];
  }).join("").trim();
  return text || null;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function readReport(target: string): Promise<AuthoringEvalReport | null> {
  const path = resolve(target, ".dojo", "evals", "report.json");
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as AuthoringEvalReport;
}
