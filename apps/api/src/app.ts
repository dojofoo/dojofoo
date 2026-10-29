import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { apiRoutes } from "./api-schema";
import { MemoryCourseEventStore, type CourseEventStore } from "./event-store";
import { auditCourseFiles, auditProviders, verdict, type CourseAuditStore } from "./course-audit";

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
  author: string;
  language: string;
  framework: string | null;
  tags: string[];
  kataCount: number;
  katas: string[];
  hash: string | null;
  files: CourseFile[] | null;
  mode?: "katas" | "interactive";
  /** Trial: installable by its repository, not in the catalog. Courses without one are enabled. */
  status?: CourseStatus;
}

export type CourseStatus = "trial" | "enabled";

export type CourseEventName = "installed" | "started" | "kata_completed" | "finished";

export interface CourseEvent {
  instanceId: string;
  courseId: string;
  event: CourseEventName;
  occurredAt: string;
  kata?: string;
}

export interface CourseRegistrationSource {
  type: "github";
  repository: string;
  integrity?: string;
}

export interface CourseRegistrar {
  register(source: CourseRegistrationSource): Promise<Course | null>;
}

export interface CourseStore {
  list(): Promise<Course[]>;
}

interface CoursesAppOptions {
  courses?: Course[];
  events?: CourseEvent[];
  eventStore?: CourseEventStore;
  registrar?: CourseRegistrar;
  courseStore?: CourseStore;
  auditStore?: CourseAuditStore;
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
  mode,
}: Course) => ({ id, slug, name, source, installs, sourceType, installUrl, url, mode });

const courseEventNames = new Set<CourseEventName>([
  "installed",
  "started",
  "kata_completed",
  "finished",
]);

const catalogCacheControl = "public, max-age=30, s-maxage=60, stale-while-revalidate=300, stale-if-error=86400";
const snapshotCacheControl = "public, max-age=300, s-maxage=300, stale-while-revalidate=3600, stale-if-error=86400";

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
  const builtInCourses = [...(options.courses ?? [])];
  const registeredCourses: Course[] = [];
  const eventStore = options.eventStore ?? new MemoryCourseEventStore(options.events);
  const legacyCourseId = (course: Course) =>
    course.source === "dojofoo" ? `dojocho/${course.slug}` : undefined;
  let coursesCache: { expiresAt: number; value: Course[] } | undefined;
  const allCourses = async () => {
    if (coursesCache && coursesCache.expiresAt > Date.now()) return coursesCache.value;
    const externalCourses = options.courseStore ? await options.courseStore.list() : [];
    // The store's copy wins over this instance's registrations: a course enabled there is listed here
    const value = [...new Map(
      [...builtInCourses, ...registeredCourses, ...externalCourses]
        .map((course) => [course.id, course]),
    ).values()];
    coursesCache = { expiresAt: Date.now() + 30_000, value };
    return value;
  };
  // The catalog: every course out of trial
  const listedCourses = async () => (await allCourses()).filter((course) => course.status !== "trial");
  const findCourse = async (source: string, slug: string) =>
    (await allCourses()).find(
      (candidate) =>
        candidate.slug === slug
        && (candidate.source === source || (source === "dojocho" && candidate.source === "dojofoo")),
    );
  const eventsForCourse = async (course: Course) => {
    const legacyId = legacyCourseId(course);
    const eventGroups = await Promise.all(
      [course.id, ...(legacyId ? [legacyId] : [])].map((courseId) => eventStore.list(courseId)),
    );
    return eventGroups.flat().map((event) => ({ ...event, courseId: course.id }));
  };
  const withRecordedInstalls = async (course: Course) => ({
    ...course,
    installs: courseMetrics(course, await eventsForCourse(course)).installs,
  });
  const catalogWithRecordedInstalls = async () =>
    Promise.all((await listedCourses()).map(withRecordedInstalls));
  const marketplaceCourses = async () => {
    const [courses, allEvents] = await Promise.all([
      listedCourses(),
      eventStore.listAll(),
    ]);
    const normalizedEvents = new Map(courses.map((course) => [course.id, [] as CourseEvent[]]));
    const courseByEventId = new Map(
      courses.flatMap((course) => [
        [course.id, course] as const,
        ...(legacyCourseId(course) ? [[legacyCourseId(course)!, course] as const] : []),
      ]),
    );
    for (const event of allEvents) {
      const course = courseByEventId.get(event.courseId);
      if (!course) continue;
      normalizedEvents.get(course.id)?.push({ ...event, courseId: course.id });
    }
    const ranked = courses.map((course) => {
      const events = normalizedEvents.get(course.id) ?? [];
      return {
        course,
        metrics: courseMetrics(course, events),
        recentInstalls: installCountBetween(
          events,
          Date.now() - 7 * 24 * 60 * 60_000,
          Date.now() + 1,
        ),
      };
    });
    const trendingRank = new Map(
      [...ranked]
        .sort((left, right) => right.recentInstalls - left.recentInstalls)
        .map((item, index) => [item.course.id, index]),
    );

    return ranked.map(({ course, metrics }) => ({
      ...listingFields(course),
      description: course.description,
      version: course.version,
      publishedAt: course.publishedAt,
      repository: course.repository,
      repositoryUrl: course.repositoryUrl,
      author: course.author,
      language: course.language,
      framework: course.framework,
      tags: course.tags,
      kataCount: course.kataCount,
      installs: metrics.installs,
      metrics,
      trendingRank: trendingRank.get(course.id) ?? Number.MAX_SAFE_INTEGER,
    }));
  };

  return new Elysia()
    .use(openapi({
      path: "/api/v1/openapi",
      documentation: {
        info: { title: "Dojo Course API", version: "1.0.0", description: "Browse and download courses, read learning metrics, and record course lifecycle events." },
        servers: [{ url: "https://dojo.foo" }], security: [],
        // The collections, in the docs' order
        tags: [
          { name: "Courses", description: "The catalog: listings, search, each course's files and its learning metrics." },
          { name: "Events", description: "Lifecycle events the CLI records: installs, starts, kata completions and finishes." },
          { name: "Health", description: "Whether the API is up." },
        ],
      },
      exclude: { paths: ["/health", "/api/v1/courses/*"] },
    }))
    .get("/health", () => ({ status: "ok" }), { detail: { hide: true } })
    .get("/api/v1/health", () => ({ status: "ok" }), apiRoutes.health)
    .get("/api/v1/course-profiles", async ({ set }) => {
      set.headers["cache-control"] = snapshotCacheControl;
      return { data: (await listedCourses()).map(({ id, description, version, publishedAt, repository, repositoryUrl, author, language, framework, tags, kataCount }) => ({
        id,
        description,
        version,
        publishedAt,
        repository,
        repositoryUrl,
        author,
        language,
        framework,
        tags,
        kataCount,
      })) };
    }, apiRoutes.profiles)
    .get("/api/v1/marketplace", async ({ set }) => {
      set.headers["cache-control"] = catalogCacheControl;
      return { data: await marketplaceCourses() };
    }, apiRoutes.marketplace)
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
          const events = await eventsForCourse(course);
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
    }, apiRoutes.list)
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
          return [course.name, course.slug, course.source, course.description, course.author, course.language, course.framework ?? "", ...course.tags]
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
    }, apiRoutes.search)
    .get("/api/v1/courses/curated", async ({ set }) => {
      set.headers["cache-control"] = snapshotCacheControl;
      const owners = new Map<string, Course[]>();
      const currentCourses = await catalogWithRecordedInstalls();
      for (const course of currentCourses) {
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
        totalCourses: currentCourses.length,
        generatedAt: new Date().toISOString(),
      };
    }, apiRoutes.curated)
    .get("/api/v1/courses/:source/:slug/metrics", async ({ params, set, status }) => {
      const course = await findCourse(params.source, params.slug);
      if (!course) {
        return status(404, { error: "course_not_found", message: "Course not found." });
      }
      set.headers["cache-control"] = catalogCacheControl;
      return courseMetrics(course, await eventsForCourse(course));
    }, apiRoutes.metrics)
    .get("/api/v1/courses/audit/:source/:slug", async ({ params, set, status }) => {
      const course = await findCourse(params.source, params.slug);
      const audits = course && options.auditStore ? await options.auditStore.list(course.id) : [];
      if (!course || audits.length === 0) {
        return status(404, {
          error: "course_audit_not_found",
          message: "No audits exist for this course.",
        });
      }
      set.headers["cache-control"] = catalogCacheControl;
      return {
        id: course.id,
        source: course.source,
        slug: course.slug,
        status: course.status ?? "enabled",
        hash: course.hash,
        audits: audits.map((audit) => ({
          provider: auditProviders[audit.provider],
          slug: audit.provider,
          status: audit.status,
          riskLevel: audit.riskLevel,
          summary: audit.summary,
          auditedAt: audit.auditedAt,
          hash: audit.hash,
          findings: audit.findings,
        })),
      };
    }, apiRoutes.audit)
    .get("/api/v1/courses/:source/:slug", async ({ params, set, status }) => {
      const course = await findCourse(params.source, params.slug);
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
    }, apiRoutes.course)
    .get("/api/v1/courses/*", async ({ params, set, status }) => {
      const course = (await allCourses()).find((candidate) => candidate.id === params["*"]);
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
      const body = (await request.json()) as Partial<CourseEvent> & {
        source?: Partial<CourseRegistrationSource>;
      };
      if (!body.instanceId) {
          return status(400, { error: "invalid_event", message: "instanceId is required." });
      }
      let course = body.courseId
        ? (await allCourses()).find((candidate) =>
            candidate.id === body.courseId || legacyCourseId(candidate) === body.courseId)
        : undefined;
      const sourceRepository = body.source?.repository;
      if (
        body.event === "installed"
        && options.registrar
        && body.source?.type === "github"
        && typeof sourceRepository === "string"
        && sourceRepository === body.courseId
        && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(sourceRepository)
      ) {
        const registration = await options.registrar.register({
          type: "github",
          repository: sourceRepository,
          ...(typeof body.source.integrity === "string"
            ? { integrity: body.source.integrity }
            : {}),
        }) ?? undefined;
        const previous = registration && (await allCourses()).find((candidate) => candidate.id === registration.id);
        // A course the API hasn't seen starts in trial; one it knows keeps its status
        const registered = registration && {
          ...registration,
          status: registration.status ?? (previous ? previous.status ?? "enabled" : "trial"),
        };
        if (registered) {
          course = registered;
          const existingIndex = registeredCourses.findIndex(
            (candidate) => candidate.id === registered.id,
          );
          if (existingIndex === -1) registeredCourses.push(registered);
          else registeredCourses[existingIndex] = registered;
          coursesCache = undefined;
          // Dojo's checks, once per snapshot
          if (options.auditStore) {
            const audits = await options.auditStore.list(registered.id);
            if (!audits.some((audit) => audit.provider === "dojo" && audit.hash === registered.hash)) {
              const findings = auditCourseFiles(registered.files);
              await options.auditStore.save({
                courseId: registered.id,
                provider: "dojo",
                hash: registered.hash,
                ...verdict(findings),
                findings,
                auditedAt: new Date().toISOString(),
              });
            }
          }
        }
      }
      if (!course) {
        return status(400, { error: "invalid_event", message: "courseId is invalid." });
      }
      if (!body.event || !courseEventNames.has(body.event)) {
        return status(400, { error: "invalid_event", message: "event is invalid." });
      }

      const event: CourseEvent = {
        instanceId: body.instanceId,
        courseId: course.id,
        event: body.event,
        occurredAt: body.occurredAt ?? new Date().toISOString(),
        ...(body.kata ? { kata: body.kata } : {}),
      };
      const duplicate = !(await eventStore.append(event));
      return status(202, { accepted: true, duplicate });
    }, apiRoutes.events);
}
