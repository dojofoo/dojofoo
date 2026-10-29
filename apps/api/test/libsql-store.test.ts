import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createClient } from "@libsql/client/sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  LibsqlCourseAuditStore,
  LibsqlCourseStore,
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
    const store = await LibsqlCourseEventStore.fromClient(createClient({
      url: `file:${resolve(directory, "events.db")}`,
    }));
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

describe("LibsqlCourseStore", () => {
  it("persists external course snapshots across store instances", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "dojofoo-courses-"));
    temporaryDirectories.push(directory);
    const config = { url: `file:${resolve(directory, "courses.db")}` };
    const first = await LibsqlCourseStore.fromClient(createClient(config));
    const externalCourse = {
      id: "acme/typescript-basics",
      slug: "typescript-basics",
      name: "TypeScript Basics",
      source: "acme",
      description: "A small external dojo.",
      version: "0.0.1",
      publishedAt: "2026-08-11T10:00:00.000Z",
      repository: "acme/typescript-basics",
      repositoryUrl: "https://github.com/acme/typescript-basics",
      installs: 0,
      sourceType: "github" as const,
      installUrl: "acme/typescript-basics",
      url: "https://dojo.foo/courses/acme/typescript-basics",
      author: "Tom Siwik",
      language: "TypeScript",
      framework: "Effect",
      tags: ["Functional programming"],
      kataCount: 1,
      katas: ["001-values"],
      hash: "sha256-course",
      files: [{ path: "dojo.json", contents: "{}" }],
    };

    expect(await first.upsert(externalCourse)).toBe("trial");
    const reopened = await LibsqlCourseStore.fromClient(createClient(config));

    expect(await reopened.list()).toEqual([{ ...externalCourse, status: "trial" }]);
    await reopened.remove(externalCourse.id);
    expect(await reopened.list()).toEqual([]);
  });

  it("normalizes legacy snapshots that predate course facets", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "dojofoo-legacy-courses-"));
    temporaryDirectories.push(directory);
    const store = await LibsqlCourseStore.fromClient(createClient({
      url: `file:${resolve(directory, "courses.db")}`,
    }));
    await store.upsert({
      id: "acme/legacy",
      slug: "legacy",
      name: "Legacy",
      source: "acme",
      description: "An older snapshot.",
      version: "0.0.1",
      publishedAt: "2026-01-01T00:00:00.000Z",
      repository: "acme/legacy",
      repositoryUrl: "https://github.com/acme/legacy",
      installs: 0,
      sourceType: "github",
      installUrl: "acme/legacy",
      url: "https://dojo.foo/courses/acme/legacy",
      categories: ["JavaScript"],
      kataCount: 1,
      katas: ["001"],
      hash: null,
      files: null,
    } as never);

    expect(await store.list()).toEqual([
      expect.objectContaining({
        author: "acme",
        language: "Other",
        framework: null,
        tags: [],
      }),
    ]);
  });

  it("keeps an enabled course enabled when its snapshot is refreshed", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "dojofoo-course-status-"));
    temporaryDirectories.push(directory);
    const client = createClient({ url: `file:${resolve(directory, "courses.db")}` });
    const store = await LibsqlCourseStore.fromClient(client);
    const course = { id: "acme/basics", version: "0.0.1", files: null } as never;

    await store.upsert(course);
    await client.execute("UPDATE external_courses SET status = 'enabled' WHERE id = 'acme/basics'");

    expect(await store.upsert({ ...(course as object), version: "0.0.2" } as never)).toBe("enabled");
    expect(await store.list()).toEqual([expect.objectContaining({ version: "0.0.2", status: "enabled" })]);
  });

  it("keeps courses listed before trials existed enabled", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "dojofoo-course-migration-"));
    temporaryDirectories.push(directory);
    const client = createClient({ url: `file:${resolve(directory, "courses.db")}` });
    await client.execute("CREATE TABLE external_courses (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL)");
    await client.execute({ sql: "INSERT INTO external_courses VALUES (?, ?)", args: ["acme/listed", JSON.stringify({ id: "acme/listed" })] });

    const store = await LibsqlCourseStore.fromClient(client);
    await store.upsert({ id: "acme/new" } as never);

    expect(await store.list()).toEqual([
      expect.objectContaining({ id: "acme/listed", status: "enabled" }),
      expect.objectContaining({ id: "acme/new", status: "trial" }),
    ]);
  });
});

describe("LibsqlCourseAuditStore", () => {
  it("keeps the latest audit per provider", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "dojofoo-audits-"));
    temporaryDirectories.push(directory);
    const config = { url: `file:${resolve(directory, "audits.db")}` };
    const store = await LibsqlCourseAuditStore.fromClient(createClient(config));
    const audit = {
      courseId: "acme/basics",
      provider: "dojo" as const,
      hash: "tree-1",
      status: "fail" as const,
      riskLevel: "HIGH" as const,
      summary: "1 finding: runs a postinstall script on install",
      findings: [{ rule: "install_script", riskLevel: "HIGH" as const, message: "runs a postinstall script on install", path: "package.json" }],
      auditedAt: "2026-10-26T10:00:00.000Z",
    };

    await store.save(audit);
    await store.save({ ...audit, hash: "tree-2", status: "pass", riskLevel: "NONE", summary: "No risks detected", findings: [] });
    await store.save({ ...audit, provider: "cisco" });
    const reopened = await LibsqlCourseAuditStore.fromClient(createClient(config));

    expect(await reopened.list("acme/basics")).toEqual([
      { ...audit, provider: "cisco" },
      { ...audit, hash: "tree-2", status: "pass", riskLevel: "NONE", summary: "No risks detected", findings: [] },
    ]);
    expect(await reopened.list("acme/other")).toEqual([]);
  });
});
