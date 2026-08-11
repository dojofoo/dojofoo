import { describe, expect, it } from "vitest";
import { createCoursesApp } from "../src/app";

const course = {
  id: "dojocho/effect-ts",
  slug: "effect-ts",
  name: "Effect TS",
  source: "dojocho",
  description: "Master Effect through hands-on katas",
  installs: 4,
  sourceType: "npm" as const,
  installUrl: "@dojocho/effect-ts",
  url: "https://dojocho.ai/courses/dojocho/effect-ts",
  categories: ["TypeScript", "Functional programming"],
  kataCount: 40,
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
          id: "dojocho/effect-ts",
          slug: "effect-ts",
          name: "Effect TS",
          source: "dojocho",
          installs: 4,
          sourceType: "npm",
          installUrl: "@dojocho/effect-ts",
          url: "https://dojocho.ai/courses/dojocho/effect-ts",
        },
      ],
      pagination: { page: 0, perPage: 10, total: 1, hasMore: false },
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
      new Request("http://localhost/api/v1/courses/dojocho/effect-ts/metrics"),
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
          id: "dojocho/effect-ts",
          slug: "effect-ts",
          name: "Effect TS",
          source: "dojocho",
          installs: 4,
          sourceType: "npm",
          installUrl: "@dojocho/effect-ts",
          url: "https://dojocho.ai/courses/dojocho/effect-ts",
        },
      ],
      query: "effect",
      searchType: "fuzzy",
      count: 1,
      durationMs: expect.any(Number),
    });
  });

  it("returns a minimal detail object and file snapshot", async () => {
    const app = createCoursesApp({ courses: [course] });
    const response = await app.handle(
      new Request("http://localhost/api/v1/courses/dojocho/effect-ts"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "dojocho/effect-ts",
      source: "dojocho",
      slug: "effect-ts",
      installs: 4,
      hash: "effect-ts-v1",
      files: [{ path: "DOJO.md", contents: "# Effect TS" }],
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
          id: "dojocho/effect-ts",
          description: "Master Effect through hands-on katas",
          categories: ["TypeScript", "Functional programming"],
          kataCount: 40,
        },
      ],
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
          owner: "dojocho",
          totalInstalls: 4,
          featuredRepo: "dojocho",
          featuredCourse: "effect-ts",
          courses: [expect.objectContaining({ id: "dojocho/effect-ts" })],
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
      new Request("http://localhost/api/v1/courses/dojocho/effect-ts/metrics"),
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
});
