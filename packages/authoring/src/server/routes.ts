import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
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
import { readAuthoringFile, saveAuthoringFile } from "./files";
import type { AuthoringAgent, AuthoringStreamPart } from "./types";
import { evaluateFromAuthoring } from "../evaluation/host.ts";
import { configuredEvaluation, readEvaluationSettings, writeEvaluationSettings } from "../evaluation/settings.ts";
import { materialHash, readLessonMaterial } from "../evaluation/material.ts";
import type { EvaluationReport } from "../evaluation/run";
import { decidePanel } from "../evaluation/panel";
import { harnessModels } from "../eve/models.ts";

export type AuthoringEvalReport = EvaluationReport;

export type AuthoringRouteDependencies = {
  agent: AuthoringAgent;
  evaluate?: typeof evaluateFromAuthoring;
  teachingPolicy(mode: string): string;
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
  .get("/models", async c => {
    // Resolve authorization before accessing this machine's native harnesses.
    dependencies.resolveWorkspace(c.req.raw);
    const harness = c.req.query("harness");
    if (!harness || !["codex", "opencode", "pi", "cursor", "grok", "fx"].includes(harness)) return c.json({ error: "Select a supported harness" }, 422);
    return c.json(await harnessModels(harness, AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(20_000)])));
  })
  .get("/evaluation-settings", async c => c.json(await readEvaluationSettings(dependencies.resolveWorkspace(c.req.raw))))
  .put("/evaluation-settings", async c => {
    try { return c.json(await writeEvaluationSettings(dependencies.resolveWorkspace(c.req.raw), await c.req.json())); }
    catch (error) { return c.json({ error: errorMessage(error) }, 422); }
  })
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
  .get("/files/:path{.+}", async (c) => {
    try {
      return c.json(await readAuthoringFile(
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
      await saveAuthoringFile(root, c.req.param("path"), input.content);
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
    const report = await readReport(root, dependencies.teachingPolicy, c.req.query("lessonId"));
    return report
      ? c.json({ root, report })
      : c.json({ root, report: null });
  })
  // One status per lesson for the sidebar: preflight readiness, then the
  // latest trial verdict for that lesson.
  .get("/reports", async (c) => {
    const root = dependencies.resolveWorkspace(c.req.raw);
    const lessons = readAuthoringDraft(root).lessons;
    const entries = await Promise.all(lessons.map(async lesson => {
      const report = await readReport(root, dependencies.teachingPolicy, lesson.id).catch(() => null);
      const status = report?.status ?? (lesson.checks.every(({ ready }) => ready) ? "ready" : "draft");
      return [lesson.id, status] as const;
    }));
    return c.json({ root, statuses: Object.fromEntries(entries) });
  })
  .post("/evals", async (c) => {
    const root = dependencies.resolveWorkspace(c.req.raw);
    const input = await c.req.json<{ lessonIds?: unknown; callId?: unknown }>();
    if (!Array.isArray(input.lessonIds) || !input.lessonIds.length || input.lessonIds.length > 2 || !input.lessonIds.every(id => typeof id === "string" && id.trim()) || typeof input.callId !== "string" || !input.callId.trim()) {
      return c.json({ error: "Select one lesson or two lessons for continuity and supply a callId" }, 422);
    }
    const lessonIds: string[] = input.lessonIds;
    const missing = authoringEvalReadiness(root).filter(({ id, ready }) => !ready && (!id.includes(":") || lessonIds.some(lesson => id.startsWith(`${lesson}:`))));
    if (missing.length > 0) {
      return c.json({
        error: "The draft is not ready to evaluate.",
        missing,
      }, 409);
    }
    const result = await (dependencies.evaluate ?? evaluateFromAuthoring)({
      root, lessonIds, callId: input.callId, signal: c.req.raw.signal,
      config: await configuredEvaluation(root),
    });
    return c.json({ root, ...result });
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

const orphanedAfterMs = 40 * 60_000;

async function readReport(target: string, teachingPolicy: (mode: string) => string, lessonId?: string): Promise<AuthoringEvalReport | null> {
  const directory = resolve(target, ".dojo", "evaluations");
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  const reports: EvaluationReport[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("run-")) continue;
    // A report being rewritten, or left behind by an older build, is skipped
    // rather than failing the whole lesson view.
    try { reports.push(JSON.parse(await readFile(resolve(directory, entry.name, "report.json"), "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
  }
  // Predecessors supply continuity context; only the last lesson is taught.
  const latest = reports.filter(report => !lessonId || report.lessonIds?.at(-1) === lessonId)
    .sort((a, b) => String(b.startedAt ?? "").localeCompare(String(a.startedAt ?? "")))[0];
  if (!latest) return null;
  // The worker gives up after 36 minutes; a run still "running" well past that
  // was killed (closed tab, restart) and will never finish.
  if (latest.status === "running" && Date.now() - Date.parse(latest.startedAt) > orphanedAfterMs) {
    return { ...latest, status: "infrastructure-failed", error: "This evaluation was interrupted before it finished. Run the lesson evaluation again." };
  }
  // Preserve historical evidence, but do not advertise passes from the older
  // policy which discarded a required criterion when only one judge failed it.
  if (latest.status === "passed" && [latest.material, latest.teaching].some(panel => decidePanel(panel ?? []).outcome !== "pass")) {
    return { ...latest, status: "stale", error: "This result does not meet the current judge-panel acceptance rule. Run the lesson evaluation again." };
  }
  if (latest.status === "passed") {
    const currentPolicyHash = createHash("sha256").update(teachingPolicy(readAuthoringDraft(target).style)).digest("hex");
    if (latest.teachingPolicyHash !== currentPolicyHash) {
      return { ...latest, status: "stale", error: "The teaching instructions have changed or were not recorded in this result. Run the lesson evaluation again." };
    }
  }
  // A verdict covers the exact material it judged. Edits made after the run
  // (including by hand in the editor) make any completed result stale.
  if (latest.status !== "running" && latest.status !== "stale" && Array.isArray(latest.lessonIds) && latest.materialHash) {
    try {
      if (materialHash(await readLessonMaterial(target, latest.lessonIds)) !== latest.materialHash) return { ...latest, status: "stale" };
    } catch { return { ...latest, status: "stale" }; }
  }
  return latest;
}
