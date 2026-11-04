import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Hono } from "hono";
import {
  createAuthoringLesson,
  createAuthoringChapter,
  renameAuthoringChapter,
  createLessonTrial,
  authoringEvalReadiness,
  renameAuthoringCourse,
  updateAuthoringAppearance,
  renameAuthoringLesson,
  readAuthoringDraft,
} from "@dojofoo/agents/service";
import { readAuthoringFile, saveAuthoringFile } from "@dojofoo/agents/files";
import { readEvaluationSettings, writeEvaluationSettings } from "@dojofoo/agents/evaluation/settings";
import { materialHash, readLessonMaterial } from "@dojofoo/agents/evaluation/material";
import type { EvaluationReceipt, EvaluationReport } from "@dojofoo/agents/evaluation/run";
import { decidePanel } from "@dojofoo/agents/evaluation/panel";
import type { EvaluationFailureCode } from "@dojofoo/protocol";
import { readAgentModel, resolveAgent } from "@dojofoo/config/runtime";

export type AuthoringEvalReport = EvaluationReport;

/** The UI server's evaluation of a draft's lessons; it throws EvaluationRefused or MaterialFailure before any attempt is spent. */
export type AuthoringEvaluate = (input: { root: string; lessonIds: string[]; callId: string; signal: AbortSignal }) => Promise<EvaluationReceipt>;

export type AuthoringRouteDependencies = {
  evaluate: AuthoringEvaluate;
  teachingPolicy(mode: string): string;
  resolveWorkspace(request: Request): string;
};

export function createAuthoringRoutes(dependencies: AuthoringRouteDependencies) {
  return new Hono()
  .onError((error, c) => c.json({ error: errorMessage(error) }, 500))
  .get("/draft", (c) => c.json(readAuthoringDraft(dependencies.resolveWorkspace(c.req.raw))))
  .get("/evaluation-settings", async c => c.json(await readEvaluationSettings(dependencies.resolveWorkspace(c.req.raw))))
  .put("/evaluation-settings", async c => {
    try { return c.json(await writeEvaluationSettings(dependencies.resolveWorkspace(c.req.raw), await c.req.json())); }
    catch (error) { return c.json({ error: errorMessage(error) }, 422); }
  })
  .post("/chapters", async c => {
    try {
      const input = await c.req.json<{ title?: unknown }>();
      if (input.title !== undefined && (typeof input.title !== "string" || !input.title.trim())) return c.json({ error: "Chapter title is required" }, 422);
      const root = dependencies.resolveWorkspace(c.req.raw);
      const chapterId = createAuthoringChapter(root, typeof input.title === "string" ? input.title : "New chapter");
      return c.json({ chapterId, workspace: readAuthoringDraft(root) }, 201);
    } catch (cause) { return c.json({ error: errorMessage(cause) }, 422); }
  })
  .patch("/chapters/:chapterId", async c => {
    try {
      const input = await c.req.json<{ title?: unknown }>();
      if (typeof input.title !== "string" || !input.title.trim()) return c.json({ error: "Chapter title is required" }, 422);
      const root = dependencies.resolveWorkspace(c.req.raw);
      renameAuthoringChapter(root, c.req.param("chapterId"), input.title);
      return c.json(readAuthoringDraft(root));
    } catch (cause) { return c.json({ error: errorMessage(cause) }, 422); }
  })
  .post("/lessons", async (c) => {
    try {
      const input: { title?: unknown; chapterId?: string } = await c.req
        .json<{ title?: unknown; chapterId?: string }>()
        .catch(() => ({}));
      const root = dependencies.resolveWorkspace(c.req.raw);
      const lessonId = createAuthoringLesson(
        root,
        typeof input.title === "string" ? input.title : "Untitled lesson",
        input.chapterId,
      );
      return c.json({ lessonId, workspace: readAuthoringDraft(root) }, 201);
    } catch (cause) {
      return c.json({ error: errorMessage(cause) }, 422);
    }
  })
  .patch("/course", async (c) => {
    try {
      const input = await c.req.json<{ title?: unknown; appearance?: unknown }>();
      if ((input.title !== undefined && (typeof input.title !== "string" || !input.title.trim())) || (input.appearance === undefined && input.title === undefined)) {
        return c.json({ error: "Course title is required" }, 422);
      }
      const root = dependencies.resolveWorkspace(c.req.raw);
      if (input.appearance !== undefined) updateAuthoringAppearance(root, input.appearance);
      if (typeof input.title === "string") renameAuthoringCourse(root, input.title);
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
  .post("/lessons/:lessonId/trials", (c) => {
    const root = dependencies.resolveWorkspace(c.req.raw);
    const agent = resolveAgent(root);
    return c.json(createLessonTrial(root, c.req.param("lessonId"), { agent, model: readAgentModel(root, agent) }), 201);
  })
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
    let result;
    try {
      result = await dependencies.evaluate({ root, lessonIds, callId: input.callId, signal: c.req.raw.signal });
    } catch (error) {
      const code = refusalCode(error);
      if (code) return c.json({ error: errorMessage(error), code }, 409);
      throw error;
    }
    return c.json({ root, ...result });
  });
}

/** A refused evaluation's code. By name: the UI server loads the evaluation outside its module graph, so its classes are not this
 *  module's (step-7 plan, decision 46). */
function refusalCode(error: unknown): EvaluationFailureCode | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error.name === "EvaluationRefused") return (error as Error & { code: EvaluationFailureCode }).code;
  return error.name === "MaterialFailure" ? "preflight_failed" : undefined;
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
