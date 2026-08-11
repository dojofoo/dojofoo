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
  installs: number;
  sourceType: "github" | "well-known" | "npm";
  installUrl: string | null;
  url: string;
  categories: string[];
  kataCount: number;
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

function courseMetrics(course: Course, events: CourseEvent[]) {
  const courseEvents = events.filter((event) => event.courseId === course.id);
  const instances = new Map<string, { started: boolean; finished: boolean }>();
  const katas = new Map<string, { started: Set<string>; finished: Set<string> }>();

  for (const event of courseEvents) {
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
    kataProgress: [...katas.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([kata, value]) => ({
        kata,
        started: value.started.size,
        finished: value.finished.size,
        active: value.started.size - value.finished.size,
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
      data: courses.map(({ id, description, categories, kataCount }) => ({
        id,
        description,
        categories,
        kataCount,
      })),
    }))
    .get("/api/v1/courses", async ({ query }) => {
      const page = Math.max(0, Number.parseInt(query.page ?? "0", 10) || 0);
      const perPage = Math.min(500, Math.max(1, Number.parseInt(query.per_page ?? "100", 10) || 100));
      const sorted = (await catalogWithRecordedInstalls())
        .sort((left, right) => right.installs - left.installs);
      const offset = page * perPage;

      return {
        data: sorted.slice(offset, offset + perPage).map(listingFields),
        pagination: {
          page,
          perPage,
          total: sorted.length,
          hasMore: offset + perPage < sorted.length,
        },
      };
    })
    .get("/api/v1/courses/search", async ({ query, status }) => {
      const startedAt = performance.now();
      const searchQuery = query.q?.trim() ?? "";
      if (searchQuery.length < 2) {
        return status(400, {
          error: "invalid_query",
          message: "q must contain at least 2 characters.",
        });
      }
      const limit = Math.min(200, Math.max(1, Number.parseInt(query.limit ?? "50", 10) || 50));
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
    .get("/api/v1/courses/curated", async () => {
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
    .get("/api/v1/courses/:source/:slug", async ({ params, status }) => {
      const course = courses.find(
        (candidate) => candidate.source === params.source && candidate.slug === params.slug,
      );
      if (!course) {
        return status(404, { error: "course_not_found", message: "Course not found." });
      }
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
