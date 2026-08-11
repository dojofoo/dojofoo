import { describe, expect, it } from "vitest";
import { createCoursesApp, type CourseEvent } from "../src/app";
import { MemoryCourseEventStore } from "../src/event-store";

const course = {
  id: "dojofoo/effect-ts",
  slug: "effect-ts",
  name: "Effect TS",
  source: "dojofoo",
  description: "Effect katas",
  version: "0.0.4",
  publishedAt: "2026-02-14T01:32:25.000Z",
  repository: "dojofoo/effect-ts",
  repositoryUrl: "https://github.com/dojofoo/effect-ts",
  installs: 0,
  sourceType: "npm" as const,
  installUrl: "@dojofoo/effect-ts",
  url: "https://dojo.foo/courses/dojofoo/effect-ts",
  author: "Tom Siwik",
  language: "TypeScript",
  framework: "Effect",
  tags: ["Functional programming"],
  kataCount: 1,
  katas: [],
  hash: null,
  files: null,
};

describe("course event store", () => {
  it("keeps idempotency when separate API instances share durable storage", async () => {
    const store = new MemoryCourseEventStore();
    const event: Omit<CourseEvent, "occurredAt"> = {
      instanceId: "project-1",
      courseId: course.id,
      event: "started",
      kata: "001-basics",
    };

    for (const app of [
      createCoursesApp({ courses: [course], eventStore: store }),
      createCoursesApp({ courses: [course], eventStore: store }),
    ]) {
      const response = await app.handle(new Request("http://localhost/api/v1/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      }));
      expect(response.status).toBe(202);
    }

    expect(await store.list(course.id)).toHaveLength(1);
    const metrics = await createCoursesApp({ courses: [course], eventStore: store }).handle(
      new Request("http://localhost/api/v1/courses/dojofoo/effect-ts/metrics"),
    );
    expect(await metrics.json()).toMatchObject({ started: 1, progressing: 1 });
  });

  it("exposes recorded installs through the compatible courses listing", async () => {
    const store = new MemoryCourseEventStore();
    await store.append({
      instanceId: "project-1",
      courseId: course.id,
      event: "installed",
      occurredAt: "2026-08-11T10:00:00.000Z",
    });
    const response = await createCoursesApp({ courses: [course], eventStore: store }).handle(
      new Request("http://localhost/api/v1/courses"),
    );

    expect(await response.json()).toMatchObject({ data: [{ installs: 1 }] });
  });
});
