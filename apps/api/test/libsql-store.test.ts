import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  LibsqlCourseEventStore,
  libsqlConnectionFromEnv,
} from "../src/libsql-event-store";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("LibsqlCourseEventStore", () => {
  it("accepts the Turso variable names configured in Vercel", () => {
    expect(libsqlConnectionFromEnv({
      DATABASE_URL: "libsql://dojofoo.turso.io",
      TURSO_TOKEN: "secret",
    })).toEqual({
      url: "libsql://dojofoo.turso.io",
      authToken: "secret",
    });
  });

  it("persists unique, anonymized course events", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "dojofoo-libsql-"));
    temporaryDirectories.push(directory);
    const store = await LibsqlCourseEventStore.create({
      url: `file:${resolve(directory, "events.db")}`,
    });
    const event = {
      instanceId: "raw-project-identifier",
      courseId: "dojofoo/starter",
      event: "kata_completed" as const,
      kata: "001-values",
      occurredAt: "2026-08-11T10:00:00.000Z",
    };

    expect(await store.append(event)).toBe(true);
    expect(await store.append(event)).toBe(false);

    const [stored] = await store.list(event.courseId);
    expect(stored).toMatchObject({
      courseId: event.courseId,
      event: event.event,
      kata: event.kata,
      occurredAt: event.occurredAt,
    });
    expect(stored.instanceId).not.toBe(event.instanceId);
    expect(stored.instanceId).toMatch(/^[a-f0-9]{64}$/u);
    expect(await store.list("dojofoo/another-course")).toEqual([]);
  });
});
