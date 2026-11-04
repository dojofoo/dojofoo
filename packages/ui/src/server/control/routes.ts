import {
  forgetLocalCourse,
  listDojoRuns,
  listEvents,
  listSessions,
  listWorkspaces,
  observeWorkspacePath,
  observeCourseRun,
  readLocalSnapshot,
  type LocalStateOptions,
} from "@dojofoo/config/local-state";
import { courseMode, dojoDir, findProjectRoot, listDojos, readCourseManifest, readDojoRc, writeDojoRc, type KataProgress } from "@dojofoo/config";
import { Hono } from "hono";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { closeDraftRuntime, createDraft, isManagedDraft, newestKyoshiSession, workspaceKind } from "./drafts";
import { requestOrigin } from "../request-origin";
import { launchToken } from "../launch-token";
import { resolveWorkspaceId } from "./workspace";
import { installStarter, starterCourseIds, uninstallCourse } from "./starters";
import { courseTitle, findInstalledCourse } from "@dojofoo/config/course-installations";

import { acpClient } from "../lesson/codex-client";
import { getInteractiveLesson } from "../interactive/service";

export type CoursePosition = { lessonId: string; lessonTitle: string; lessonIndex: number; totalLessons: number; completedLessons: number; complete: boolean; slide?: number; totalSlides?: number };

const DEFAULT_ACTIVE_WINDOW_MS = 5 * 60 * 1000;

function courseLessonTitles(root: string, id: string): string[] {
  const manifest = readCourseManifest(root, id);
  if (manifest.mode === "interactive") {
    const curriculum = JSON.parse(readFileSync(resolve(dojoDir(root, id), manifest.lessons), "utf8"));
    return curriculum.lessons?.map((lesson: { title: string }) => lesson.title) ?? [curriculum.title];
  }
  return manifest.katas.map(kata => (kata.name ?? kata.template).replace(/[-_]/g, " "));
}

function installedCourseDescriptor(courseId: string, options: LocalStateOptions) {
  const course = findInstalledCourse(courseId, options);
  const rc = readDojoRc(course.root);
  const metadata = courseMetadata(course.root, course.id, rc.currentDojo === course.id ? rc.currentKata : null, rc.progress?.[course.id]);
  return { id: course.id, title: course.title, workspaceId: course.workspaceId, runId: observeCourseRun(course.root, course.id, options).runId,
    mode: courseMode(course.manifest), kata: metadata?.lessonId ?? null, description: course.manifest.description, version: course.manifest.version,
    author: course.manifest.author, repository: course.manifest.repository, language: metadata?.language ?? "Other", framework: metadata?.framework,
    appearance: metadata?.appearance, position: metadata?.position, tags: metadata?.tags ?? [], lessons: courseLessonTitles(course.root, course.id) };
}

type ControlRouteOptions = LocalStateOptions & {
  activeWindowMs?: number;
  installStarter?: typeof installStarter;
  uninstallCourse?: typeof uninstallCourse;
};

export function buildControlRoutes(options: ControlRouteOptions = {}) {
  const now = () => options.now ?? Date.now();
  const activeWindowMs = options.activeWindowMs ?? DEFAULT_ACTIVE_WINDOW_MS;
  const stateOptions = (): LocalStateOptions => ({
    stateHome: options.stateHome,
    now: now(),
  });

  return new Hono()
    .get("/starters", c => c.json(listWorkspaces(stateOptions()).flatMap(workspace =>
      starterCourseIds.flatMap(courseId => {
        try {
          readCourseManifest(workspace.path, courseId);
          return [{ workspaceId: workspace.id, courseId }];
        } catch { return []; }
      }),
    )))
    .post("/starters/:courseId/install", async c => {
      const origin = c.req.header("Origin");
      if (origin && origin !== requestOrigin(c.req.raw)) return c.json({ error: "Same-origin requests only." }, 403);
      const courseId = c.req.param("courseId");
      if (!starterCourseIds.some(id => id === courseId)) return c.json({ error: "Unknown starter course." }, 404);
      const body = await c.req.json().catch(() => null);
      if (!body || Object.keys(body).length) {
        return c.json({ error: "Courses install in the workspace where Dojo was started." }, 422);
      }
      const root = resolve(process.env.DOJO_PROJECT_ROOT ?? findProjectRoot());
      try {
        await (options.installStarter ?? installStarter)(root, courseId);
        return c.json({ workspaceId: observeWorkspacePath(root, stateOptions()), courseId }, 201);
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : "The course could not be installed." }, 500);
      }
    })
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
            return listDojos(workspace.path).flatMap(dojo => {
              const run = runs.find((candidate) =>
                candidate.workspaceId === workspace.id
                && candidate.dojo === dojo
                && candidate.completedAt === null
              );
              const progress = rc.progress?.[dojo];
              const catalog = courseMetadata(workspace.path, dojo, dojo === rc.currentDojo ? rc.currentKata : null, progress);
              if (!catalog) return [];
              const lessonId = catalog.lessonId;
              const sessions = lessonSessions(workspace.path, dojo);
              const sessionId = sessions.find((session) => session.lessonId === lessonId)?.sessionId ?? null;
              return [{
                workspaceId: workspace.id,
                runId: run?.id ?? observeCourseRun(workspace.path, dojo, stateOptions()).runId,
                dojo,
              title: courseTitle(workspace.path, dojo),
                description: catalog.description,
                language: catalog.language ?? "Other",
                framework: catalog.framework ?? null,
                tags: catalog.tags ?? [],
                mode: catalog.mode,
                kata: lessonId,
                position: catalog.position,
                appearance: catalog.appearance,
                path: workspace.path,
                workspaceName: basename(workspace.path),
                sessionId,
                sessions,
                lastSeenAt: run?.lastSeenAt ?? workspace.lastSeenAt,
                selected: resolve(workspace.path) === defaultRoot,
              }];
            });
          } catch {
            return [];
          }
        })
        .sort((left, right) => right.lastSeenAt - left.lastSeenAt);
      const ids = new Set<string>();
      for (const course of courses) {
        if (ids.has(course.dojo)) return c.json({ error: `Course ${course.title} has multiple installations. Remove the extra installation before opening it.` }, 409);
        ids.add(course.dojo);
      }
      return c.json(courses);
    })
    .delete("/courses/:courseId", async c => {
      const origin = c.req.header("Origin");
      if (origin && origin !== requestOrigin(c.req.raw)) return c.json({ error: "Same-origin requests only." }, 403);
      let course;
      try { course = findInstalledCourse(c.req.param("courseId"), stateOptions()); }
      catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 404); }
      acpClient.stopCourse(course.root, course.id);
      await (options.uninstallCourse ?? uninstallCourse)(course.root, course.id);
      const rc = readDojoRc(course.root);
      if (rc.progress) delete rc.progress[course.id];
      writeDojoRc(course.root, rc);
      for (const name of ["web.json", "interactive.json"]) {
        const path = resolve(course.root, ".dojo", name);
        if (!existsSync(path)) continue;
        const state = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
        for (const section of Object.values(state)) if (section && typeof section === "object" && !Array.isArray(section)) {
          for (const key of Object.keys(section)) if (key === course.id || key.startsWith(`${course.id}/`)) delete (section as Record<string, unknown>)[key];
        }
        writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
      }
      forgetLocalCourse(course.workspaceId, course.id, stateOptions());
      return c.body(null, 204);
    })
    .delete("/authoring/:workspaceId", async c => {
      const origin = c.req.header("Origin");
      if (origin && origin !== requestOrigin(c.req.raw)) return c.json({ error: "Same-origin requests only." }, 403);
      const workspace = listWorkspaces(stateOptions()).find(item => item.id === c.req.param("workspaceId"));
      if (!workspace) return c.json({ error: "This authoring course does not exist." }, 404);
      if (workspaceKind(workspace, stateOptions()) !== "draft") return c.json({ error: "This workspace is not an authoring course." }, 422);
      const managed = isManagedDraft(workspace.path, stateOptions());
      await closeDraftRuntime(workspace.path);
      if (managed) rmSync(workspace.path, { recursive: true });
      forgetLocalCourse(workspace.id, null, stateOptions());
      return c.body(null, 204);
    })
    .get("/courses/:courseId", c => {
      try {
        return c.json(installedCourseDescriptor(c.req.param("courseId"), stateOptions()));
      } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 404); }
    })
    .get("/learning-sessions/:sessionId", c => {
      const run = listDojoRuns(stateOptions()).find(item => item.id === c.req.param("sessionId"));
      if (!run) return c.json({ error: "This learning session does not exist." }, 404);
      try {
        const course = findInstalledCourse(run.dojo, stateOptions());
        if (course.workspaceId !== run.workspaceId) throw new Error("This course installation has been removed.");
        return c.json(installedCourseDescriptor(run.dojo, stateOptions()));
      } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 404); }
    })
    .get("/workspaces", (c) => c.json(listWorkspaces(stateOptions())))
    // The page's token for state-changing agent routes; only the UI's own pages can read it
    .get("/launch-token", (c) => {
      const origin = c.req.header("Origin");
      const site = c.req.header("Sec-Fetch-Site");
      if ((origin && origin !== requestOrigin(c.req.raw)) || (site && site !== "same-origin" && site !== "none")) {
        return c.json({ error: "Same-origin requests only." }, 403);
      }
      c.header("Cache-Control", "no-store");
      return c.json({ token: launchToken() });
    })
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
        if (workspaceKind(workspace, stateOptions()) !== "draft") return [];
        // A legacy ACP draft has no Eve session to resume
        const session = newestKyoshiSession(workspace.path);
        const manifest = readCourseManifestSource(workspace.path);
        return [{
          workspaceId: workspace.id,
          path: workspace.path,
          name: String(manifest.title ?? manifest.name ?? basename(workspace.path)),
          appearance: manifest.appearance,
          description: String(manifest.description ?? "Course draft"),
          mode: String(manifest.mode ?? "katas"),
          sessionId: session?.id ?? null,
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
    const lessonId = "katas" in catalog ? continuationLesson(catalog.katas, currentLesson, progress) : null;
    let position: CoursePosition | undefined;
    if (catalog.mode === "interactive") {
      const saved = getInteractiveLesson(root, dojo);
      position = { lessonId: saved.lessonId, lessonTitle: saved.lessonTitle, lessonIndex: saved.lessonIndex,
        totalLessons: saved.lessons.length, completedLessons: saved.completedLessons, complete: saved.complete,
        slide: Math.min(saved.step + 1, saved.totalSteps), totalSlides: saved.totalSteps };
    } else if (lessonId && "katas" in catalog) {
      const lessonIndex = catalog.katas.findIndex(item => (item.name ?? basename(dirname(item.template))) === lessonId);
      const completedLessons = catalog.katas.filter(item => progress?.completed?.includes(item.name ?? basename(dirname(item.template)))).length;
      position = { lessonId, lessonTitle: (catalog.katas[lessonIndex]?.name ?? lessonId).replace(/[-_]/g, " "), lessonIndex,
        totalLessons: catalog.katas.length, completedLessons, complete: completedLessons === catalog.katas.length };
    }
    return {
      mode, appearance: catalog.appearance,
      description: catalog.description,
      language: catalog.language ?? "Other",
      framework: catalog.framework ?? null,
      tags: catalog.tags ?? [],
      lessonId, position,
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
