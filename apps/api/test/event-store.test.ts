import { describe, expect, it } from "vitest";
import { createCoursesApp, type CourseEvent } from "../src/app";
import { MemoryCourseEventStore } from "../src/event-store";

const course = {
  id: "dojocho/effect-ts",
  slug: "effect-ts",
  name: "Effect TS",
  source: "dojocho",
  description: "Effect katas",
  version: "0.0.4",
  installs: 0,
  sourceType: "npm" as const,
  installUrl: "@dojocho/effect-ts",
  url: "https://dojocho.ai/courses/dojocho/effect-ts",
  categories: ["TypeScript"],
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
      new Request("http://localhost/api/v1/courses/dojocho/effect-ts/metrics"),
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
