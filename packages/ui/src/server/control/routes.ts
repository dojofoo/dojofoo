import {
  listDojoRuns,
  listEvents,
  listSessions,
  listWorkspaces,
  readLocalSnapshot,
  type LocalStateOptions,
} from "@dojofoo/config/local-state";
import { courseMode, readCourseManifest, readDojoRc, type KataProgress } from "@dojofoo/config";
import { Hono } from "hono";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  adoptLocalSession,
  SessionAdoptionError,
  type SessionAdoptionResult,
} from "./session-adoption";
import { createDraft, isManagedDraft } from "./drafts";
import { requestOrigin } from "../request-origin";

const DEFAULT_ACTIVE_WINDOW_MS = 5 * 60 * 1000;

type ControlRouteOptions = LocalStateOptions & {
  activeWindowMs?: number;
  adoptSession?: (sessionId: string, options: LocalStateOptions) => Promise<SessionAdoptionResult>;
};

export function buildControlRoutes(options: ControlRouteOptions = {}) {
  const now = () => options.now ?? Date.now();
  const activeWindowMs = options.activeWindowMs ?? DEFAULT_ACTIVE_WINDOW_MS;
  const stateOptions = (): LocalStateOptions => ({
    stateHome: options.stateHome,
    now: now(),
  });
  const adopt = options.adoptSession ?? adoptLocalSession;

  return new Hono()
    .get("/overview", (c) => {
      const cutoff = now() - activeWindowMs;
      const { workspaces, runs, sessions, events } = readLocalSnapshot(stateOptions());

      return c.json({
        workspaces: workspaces.length,
        runs: {
          total: runs.length,
          active: runs.filter((run) => run.completedAt === null).length,
          completed: runs.filter((run) => run.completedAt !== null).length,
        },
        sessions: {
          total: sessions.length,
          active: sessions.filter((session) => session.lastSeenAt >= cutoff).length,
        },
        events: events.length,
        activeWindowMs,
        generatedAt: now(),
      });
    })
    .get("/snapshot", (c) => {
      const generatedAt = now();
      return c.json({
        ...readLocalSnapshot(stateOptions()),
        activeWindowMs,
        generatedAt,
      });
    })
    .get("/courses", (c) => {
      const defaultRoot = resolve(process.env.DOJO_PROJECT_ROOT ?? process.cwd());
      const { workspaces, runs } = readLocalSnapshot(stateOptions());
      const courses = workspaces
        .flatMap((workspace) => {
          try {
            const rc = readDojoRc(workspace.path);
            if (!rc.currentDojo) return [];
            const run = runs.find((candidate) =>
              candidate.workspaceId === workspace.id
              && candidate.dojo === rc.currentDojo
              && candidate.completedAt === null
            );
            const progress = rc.progress?.[rc.currentDojo];
            const catalog = courseMetadata(workspace.path, rc.currentDojo, rc.currentKata, progress);
            if (!catalog) return [];
            const lessonId = catalog.lessonId;
            const sessions = lessonSessions(workspace.path, rc.currentDojo);
            const sessionId = sessions.find((session) => session.lessonId === lessonId)?.sessionId ?? null;
            return [{
              workspaceId: workspace.id,
              runId: run?.id ?? null,
              dojo: rc.currentDojo,
              description: catalog.description,
              language: catalog.language ?? "Other",
              framework: catalog.framework ?? null,
              tags: catalog.tags ?? [],
              mode: catalog.mode,
              kata: lessonId,
              path: workspace.path,
              workspaceName: basename(workspace.path),
              sessionId,
              sessions,
              lastSeenAt: run?.lastSeenAt ?? workspace.lastSeenAt,
              selected: resolve(workspace.path) === defaultRoot,
            }];
          } catch {
            return [];
          }
        })
        .sort((left, right) => right.lastSeenAt - left.lastSeenAt);
      return c.json(courses);
    })
    .get("/workspaces", (c) => c.json(listWorkspaces(stateOptions())))
    .post("/authoring", async (c) => {
      const origin = c.req.header("Origin");
      if (origin && origin !== requestOrigin(c.req.raw)) return c.json({ error: "Same-origin requests only." }, 403);
      let body: unknown;
      try { body = await c.req.json(); }
      catch { return c.json({ error: "Invalid draft request." }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)
        || Object.keys(body).some(key => key !== "name" && key !== "style")
        || !("name" in body) || typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120
        || /[\u0000-\u001f\u007f]/u.test(body.name) || ("style" in body && body.style !== "katas")) {
        return c.json({ error: "Choose a course name of 1–120 characters. Only kata drafts are supported." }, 422);
      }
      try { return c.json(createDraft(body.name.trim(), stateOptions()), 201); }
      catch (error) { return c.json({ error: error instanceof Error ? error.message : "Could not create the draft." }, 500); }
    })
    .get("/authoring", (c) => c.json(listWorkspaces(stateOptions()).flatMap((workspace) => {
      try {
        const threadPath = resolve(workspace.path, ".dojo", "kyoshi.json");
        if (!existsSync(threadPath) && !isManagedDraft(workspace.path, stateOptions())) return [];
        const thread = existsSync(threadPath) ? JSON.parse(readFileSync(threadPath, "utf8")) as { sessionId?: string } : null;
        const manifest = readCourseManifestSource(workspace.path);
        return [{
          workspaceId: workspace.id,
          path: workspace.path,
          name: String(manifest.name ?? basename(workspace.path)),
          description: String(manifest.description ?? "Course draft"),
          mode: String(manifest.mode ?? "katas"),
          sessionId: thread?.sessionId ?? null,
          lastSeenAt: workspace.lastSeenAt,
        }];
      } catch {
        return [];
      }
    }).sort((left, right) => right.lastSeenAt - left.lastSeenAt)))
    .get("/runs", (c) => {
      const status = c.req.query("status");
      const runs = listDojoRuns(stateOptions()).filter((run) => {
        if (status === "active") return run.completedAt === null;
        if (status === "completed") return run.completedAt !== null;
        return true;
      });
      return c.json(runs.map((run) => ({
        ...run,
        active: run.completedAt === null,
      })));
    })
    .get("/sessions", (c) => {
      const activeOnly = c.req.query("status") === "active";
      const cutoff = now() - activeWindowMs;
      const sessions = listSessions(stateOptions())
        .map((session) => ({ ...session, active: session.lastSeenAt >= cutoff }))
        .filter((session) => !activeOnly || session.active);
      return c.json(sessions);
    })
    .post("/sessions/:sessionId/adopt", async (c) => {
      try {
        return c.json(await adopt(c.req.param("sessionId"), stateOptions()));
      } catch (cause) {
        if (!(cause instanceof SessionAdoptionError)) throw cause;
        const status = cause.code === "not-found" ? 404
          : cause.code === "unsupported-harness" ? 422
          : 409;
        return c.json({ error: cause.message, code: cause.code }, status);
      }
    })
    .get("/events", (c) => {
      const requestedLimit = Number.parseInt(c.req.query("limit") ?? "100", 10);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), 1000)
        : 100;
      return c.json(listEvents(stateOptions()).slice(-limit).reverse());
    });
}

export const controlRoutes = buildControlRoutes();

function readCourseManifestSource(root: string): Record<string, unknown> {
  return parseYaml(readFileSync(resolve(root, "dojo.yaml"), "utf8")) as Record<string, unknown>;
}

function courseMetadata(
  root: string,
  dojo: string,
  currentLesson: string | null,
  progress?: KataProgress,
) {
  try {
    const catalog = readCourseManifest(root, dojo);
    const mode = courseMode(catalog);
    return {
      mode,
      description: catalog.description,
      language: catalog.language ?? "Other",
      framework: catalog.framework ?? null,
      tags: catalog.tags ?? [],
      lessonId: "katas" in catalog
        ? continuationLesson(catalog.katas, currentLesson, progress)
        : null,
    };
  } catch {
    return null;
  }
}

function continuationLesson(
  lessons: Array<{ name?: string; template: string; prerequisites?: string[] }>,
  currentLesson: string | null,
  progress?: KataProgress,
): string | null {
  const named = lessons.map((lesson) => ({
    ...lesson,
    id: lesson.name ?? basename(dirname(lesson.template)),
  }));
  const known = new Set(named.map((lesson) => lesson.id));
  if (currentLesson && known.has(currentLesson)) return currentLesson;
  if (progress?.lastActive && known.has(progress.lastActive)) return progress.lastActive;

  const completed = new Set(progress?.completed ?? []);
  return named.find((lesson) =>
    !completed.has(lesson.id)
    && (lesson.prerequisites ?? []).every((prerequisite) => completed.has(prerequisite))
  )?.id ?? named.at(-1)?.id ?? null;
}

function lessonSessions(root: string, dojo: string): Array<{ lessonId: string; sessionId: string }> {
  try {
    const state = JSON.parse(readFileSync(resolve(root, ".dojo", "web.json"), "utf8")) as {
      threads?: Record<string, string | { sessionId: string; aliases?: string[] }>;
    };
    return Object.entries(state.threads ?? {}).flatMap(([key, thread]) => {
      const prefix = `${dojo}/`;
      if (!key.startsWith(prefix)) return [];
      const sessionId = typeof thread === "string" ? thread : thread.sessionId;
      if (!sessionId) return [];
      const lessonId = key.slice(prefix.length);
      return [sessionId, ...(typeof thread === "string" ? [] : thread.aliases ?? [])]
        .map((candidate) => ({ lessonId, sessionId: candidate }));
    });
  } catch {
    return [];
  }
}
