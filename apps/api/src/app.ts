import { Elysia } from "elysia";
import { MemoryCourseEventStore, type CourseEventStore } from "./event-store";

export interface CourseFile {
  path: string;
  contents: string;
}

export interface Course {
  id: string;
  slug: string;
  name: string;
  source: string;
  description: string;
  version: string;
  publishedAt: string;
  repository: string;
  repositoryUrl: string;
  installs: number;
  sourceType: "github" | "well-known" | "npm";
  installUrl: string | null;
  url: string;
  categories: string[];
  kataCount: number;
  katas: string[];
  hash: string | null;
  files: CourseFile[] | null;
}

export type CourseEventName = "installed" | "started" | "kata_completed" | "finished";

export interface CourseEvent {
  instanceId: string;
  courseId: string;
  event: CourseEventName;
  occurredAt: string;
  kata?: string;
}

interface CoursesAppOptions {
  courses?: Course[];
  events?: CourseEvent[];
  eventStore?: CourseEventStore;
}

const listingFields = ({
  id,
  slug,
  name,
  source,
  installs,
  sourceType,
  installUrl,
  url,
}: Course) => ({ id, slug, name, source, installs, sourceType, installUrl, url });

const courseEventNames = new Set<CourseEventName>([
  "installed",
  "started",
  "kata_completed",
  "finished",
]);

const catalogCacheControl = "public, max-age=30, s-maxage=60";
const snapshotCacheControl = "public, max-age=300, s-maxage=300";

function installCountBetween(events: CourseEvent[], start: number, end: number) {
  return new Set(
    events
      .filter((event) => {
        const occurredAt = Date.parse(event.occurredAt);
        return event.event === "installed" && occurredAt >= start && occurredAt < end;
      })
      .map((event) => event.instanceId),
  ).size;
}

function hotInstallComparison(events: CourseEvent[], now = Date.now()) {
  const hour = 60 * 60_000;
  const installsCurrent = installCountBetween(events, now - hour, now + 1);
  const installsYesterday = installCountBetween(events, now - 25 * hour, now - 24 * hour);
  return { installsYesterday, change: installsCurrent - installsYesterday };
}

function mondayFor(occurredAt: string) {
  const date = new Date(occurredAt);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function courseMetrics(course: Course, events: CourseEvent[]) {
  const courseEvents = events.filter((event) => event.courseId === course.id);
  const instances = new Map<string, { started: boolean; finished: boolean }>();
  const katas = new Map<string, { started: Set<string>; finished: Set<string> }>();
  const weeks = new Map<
    string,
    { installs: Set<string>; started: Set<string>; finished: Set<string> }
  >();

  for (const kata of course.katas) {
    katas.set(kata, { started: new Set(), finished: new Set() });
  }

  for (const event of courseEvents) {
    const week = mondayFor(event.occurredAt);
    const activity = weeks.get(week) ?? {
      installs: new Set<string>(),
      started: new Set<string>(),
      finished: new Set<string>(),
    };
    if (event.event === "installed") activity.installs.add(event.instanceId);
    else activity.started.add(event.instanceId);
    if (event.event === "finished") activity.finished.add(event.instanceId);
    weeks.set(week, activity);

    const instance = instances.get(event.instanceId) ?? { started: false, finished: false };
    if (event.event !== "installed") instance.started = true;
    if (event.event === "finished") instance.finished = true;
    instances.set(event.instanceId, instance);

    if (!event.kata) continue;
    const kata = katas.get(event.kata) ?? { started: new Set<string>(), finished: new Set<string>() };
    kata.started.add(event.instanceId);
    if (event.event === "kata_completed" || event.event === "finished") {
      kata.finished.add(event.instanceId);
    }
    katas.set(event.kata, kata);
  }

  const started = [...instances.values()].filter((instance) => instance.started).length;
  const finished = [...instances.values()].filter((instance) => instance.finished).length;
  const eventInstalls = new Set(
    courseEvents
      .filter((event) => event.event === "installed")
      .map((event) => event.instanceId),
  ).size;

  return {
    installs: Math.max(course.installs, eventInstalls),
    started,
    progressing: started - finished,
    finished,
    completionRate: started === 0 ? 0 : Math.round((finished / started) * 1000) / 10,
    kataProgress: [...katas.entries()].map(([kata, value]) => ({
        kata,
        started: value.started.size,
        finished: value.finished.size,
        active: value.started.size - value.finished.size,
      })),
    weeklyActivity: [...weeks.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([week, activity]) => ({
        week,
        installs: activity.installs.size,
        started: activity.started.size,
        finished: activity.finished.size,
      })),
  };
}

export function createCoursesApp(options: CoursesAppOptions = {}) {
  const courses = options.courses ?? [];
  const eventStore = options.eventStore ?? new MemoryCourseEventStore(options.events);
  const withRecordedInstalls = async (course: Course) => ({
    ...course,
    installs: courseMetrics(course, await eventStore.list(course.id)).installs,
  });
  const catalogWithRecordedInstalls = () => Promise.all(courses.map(withRecordedInstalls));

  return new Elysia()
    .get("/health", () => ({ status: "ok" }))
    .get("/api/v1/health", () => ({ status: "ok" }))
    .get("/api/v1/course-profiles", () => ({
      data: courses.map(({ id, description, version, publishedAt, repository, repositoryUrl, categories, kataCount }) => ({
        id,
        description,
        version,
        publishedAt,
        repository,
        repositoryUrl,
        categories,
        kataCount,
      })),
    }))
    .get("/api/v1/courses", async ({ query, set, status }) => {
      const view = query.view ?? "all-time";
      if (!new Set(["all-time", "trending", "hot"]).has(view)) {
        return status(400, {
          error: "invalid_view",
          message: 'view must be "all-time", "trending", or "hot".',
        });
      }
      const page = query.page === undefined ? 0 : Number(query.page);
      if (!Number.isInteger(page) || page < 0) {
        return status(400, {
          error: "invalid_query",
          message: "page must be a non-negative integer.",
        });
      }
      const perPage = query.per_page === undefined ? 100 : Number(query.per_page);
      if (!Number.isInteger(perPage) || perPage < 1 || perPage > 500) {
        return status(400, {
          error: "invalid_query",
          message: "per_page must be an integer between 1 and 500.",
        });
      }
      set.headers["cache-control"] = catalogCacheControl;
      const withSignals = await Promise.all(
        (await catalogWithRecordedInstalls()).map(async (course) => {
          const events = await eventStore.list(course.id);
          const recentInstalls = installCountBetween(events, Date.now() - 7 * 24 * 60 * 60_000, Date.now() + 1);
          return { course, recentInstalls, hot: hotInstallComparison(events) };
        }),
      );
      const sorted = withSignals.sort((left, right) => {
        if (view === "trending") return right.recentInstalls - left.recentInstalls;
        if (view === "hot") return right.hot.change - left.hot.change;
        return right.course.installs - left.course.installs;
      });
      const offset = page * perPage;

      return {
        data: sorted.slice(offset, offset + perPage).map(({ course, hot }) => ({
          ...listingFields(course),
          ...(view === "hot" ? hot : {}),
        })),
        pagination: {
          page,
          perPage,
          total: sorted.length,
          hasMore: offset + perPage < sorted.length,
        },
      };
    })
    .get("/api/v1/courses/search", async ({ query, set, status }) => {
      const startedAt = performance.now();
      const searchQuery = query.q?.trim() ?? "";
      if (searchQuery.length < 2) {
        return status(400, {
          error: "invalid_query",
          message: "q must contain at least 2 characters.",
        });
      }
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        return status(400, {
          error: "invalid_query",
          message: "limit must be an integer between 1 and 200.",
        });
      }
      set.headers["cache-control"] = catalogCacheControl;
      const needle = searchQuery.toLocaleLowerCase();
      const matches = (await catalogWithRecordedInstalls())
        .filter((course) => {
          if (query.owner && course.source.split("/")[0] !== query.owner) return false;
          return [course.name, course.slug, course.source, course.description, ...course.categories]
            .some((value) => value.toLocaleLowerCase().includes(needle));
        })
        .slice(0, limit)
        .map(listingFields);

      return {
        data: matches,
        query: searchQuery,
        searchType: searchQuery.includes(" ") ? "semantic" : "fuzzy",
        count: matches.length,
        durationMs: Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100),
      };
    })
    .get("/api/v1/courses/curated", async ({ set }) => {
      set.headers["cache-control"] = snapshotCacheControl;
      const owners = new Map<string, Course[]>();
      for (const course of await catalogWithRecordedInstalls()) {
        const owner = course.source.split("/")[0];
        owners.set(owner, [...(owners.get(owner) ?? []), course]);
      }
      return {
        data: [...owners.entries()].map(([owner, ownerCourses]) => {
          const featured = [...ownerCourses].sort((left, right) => right.installs - left.installs)[0];
          return {
            owner,
            totalInstalls: ownerCourses.reduce((total, item) => total + item.installs, 0),
            featuredRepo: featured.source.split("/").at(-1) ?? featured.source,
            featuredCourse: featured.slug,
            courses: ownerCourses.map(listingFields),
          };
        }),
        totalOwners: owners.size,
        totalCourses: courses.length,
        generatedAt: new Date().toISOString(),
      };
    })
    .get("/api/v1/courses/:source/:slug/metrics", async ({ params, status }) => {
      const course = courses.find(
        (candidate) => candidate.source === params.source && candidate.slug === params.slug,
      );
      if (!course) {
        return status(404, { error: "course_not_found", message: "Course not found." });
      }
      return courseMetrics(course, await eventStore.list(course.id));
    })
    .get("/api/v1/courses/audit/*", ({ status }) =>
      status(404, {
        error: "course_audit_not_found",
        message: "No audits exist for this course.",
      }))
    .get("/api/v1/courses/:source/:slug", async ({ params, set, status }) => {
      const course = courses.find(
        (candidate) => candidate.source === params.source && candidate.slug === params.slug,
      );
      if (!course) {
        return status(404, { error: "course_not_found", message: "Course not found." });
      }
      set.headers["cache-control"] = snapshotCacheControl;
      const current = await withRecordedInstalls(course);
      return {
        id: course.id,
        source: course.source,
        slug: course.slug,
        installs: current.installs,
        hash: course.hash,
        files: course.files,
      };
    })
    .get("/api/v1/courses/*", async ({ params, set, status }) => {
      const course = courses.find((candidate) => candidate.id === params["*"]);
      if (!course) {
        return status(404, { error: "course_not_found", message: "Course not found." });
      }
      set.headers["cache-control"] = snapshotCacheControl;
      const current = await withRecordedInstalls(course);
      return {
        id: course.id,
        source: course.source,
        slug: course.slug,
        installs: current.installs,
        hash: course.hash,
        files: course.files,
      };
    })
    .post("/api/v1/events", async ({ request, status }) => {
      const body = (await request.json()) as Partial<CourseEvent>;
      if (!body.instanceId) {
          return status(400, { error: "invalid_event", message: "instanceId is required." });
      }
      if (!body.courseId || !courses.some((course) => course.id === body.courseId)) {
        return status(400, { error: "invalid_event", message: "courseId is invalid." });
      }
      if (!body.event || !courseEventNames.has(body.event)) {
        return status(400, { error: "invalid_event", message: "event is invalid." });
      }

      const event: CourseEvent = {
        instanceId: body.instanceId,
        courseId: body.courseId,
        event: body.event,
        occurredAt: body.occurredAt ?? new Date().toISOString(),
        ...(body.kata ? { kata: body.kata } : {}),
      };
      const duplicate = !(await eventStore.append(event));
      return status(202, { accepted: true, duplicate });
    });
}
