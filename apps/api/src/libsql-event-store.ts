import { createHash } from "node:crypto";
import { createClient, type Config } from "@libsql/client";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Course, CourseEvent } from "./app";
import type { CourseEventStore } from "./event-store";

const eventNames = ["installed", "started", "kata_completed", "finished"] as const;

const courseEvents = sqliteTable(
  "course_events",
  {
    courseId: text("course_id").notNull(),
    instanceHash: text("instance_hash").notNull(),
    event: text("event", { enum: eventNames }).notNull(),
    kata: text("kata").notNull().default(""),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.courseId, table.instanceHash, table.event, table.kata],
    }),
    index("course_events_course_id_idx").on(table.courseId),
  ],
);

const externalCourses = sqliteTable("external_courses", {
  id: text("id").primaryKey(),
  snapshot: text("snapshot").notNull(),
});

function hashInstanceId(instanceId: string) {
  return createHash("sha256").update(instanceId).digest("hex");
}

export function libsqlConnectionFromEnv(
  env: Record<string, string | undefined>,
): Config | null {
  if (!env.DATABASE_URL) return null;
  return {
    url: env.DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN ?? env.TURSO_TOKEN,
  };
}

export class LibsqlCourseEventStore implements CourseEventStore {
  private constructor(private readonly db: ReturnType<typeof drizzle>) {}

  static async create(config: Config) {
    const client = createClient(config);
    const db = drizzle(client);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS course_events (
        course_id TEXT NOT NULL,
        instance_hash TEXT NOT NULL,
        event TEXT NOT NULL CHECK (event IN ('installed', 'started', 'kata_completed', 'finished')),
        kata TEXT NOT NULL DEFAULT '',
        occurred_at TEXT NOT NULL,
        PRIMARY KEY (course_id, instance_hash, event, kata)
      )
    `);
    await db.run(sql`
      CREATE INDEX IF NOT EXISTS course_events_course_id_idx
      ON course_events (course_id)
    `);
    return new LibsqlCourseEventStore(db);
  }

  async list(courseId: string) {
    const rows = await this.db
      .select()
      .from(courseEvents)
      .where(eq(courseEvents.courseId, courseId))
      .orderBy(asc(courseEvents.occurredAt));

    return rows.map((row) => ({
      courseId: row.courseId,
      instanceId: row.instanceHash,
      event: row.event,
      occurredAt: row.occurredAt,
      ...(row.kata ? { kata: row.kata } : {}),
    }));
  }

  async append(event: CourseEvent) {
    const instanceHash = hashInstanceId(event.instanceId);
    const inserted = await this.db
      .insert(courseEvents)
      .values({
        courseId: event.courseId,
        instanceHash,
        event: event.event,
        kata: event.kata ?? "",
        occurredAt: event.occurredAt,
      })
      .onConflictDoNothing()
      .returning({ courseId: courseEvents.courseId })
      .get();

    return inserted !== undefined;
  }
}

export class LibsqlCourseStore {
  private constructor(private readonly db: ReturnType<typeof drizzle>) {}

  static async create(config: Config) {
    const client = createClient(config);
    const db = drizzle(client);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS external_courses (
        id TEXT PRIMARY KEY,
        snapshot TEXT NOT NULL
      )
    `);
    return new LibsqlCourseStore(db);
  }

  async list(): Promise<Course[]> {
    const rows = await this.db.select().from(externalCourses).orderBy(asc(externalCourses.id));
    return rows.map((row) => {
      const course = JSON.parse(row.snapshot) as Course & {
        author?: string;
        language?: string;
        framework?: string | null;
        tags?: string[];
      };
      return {
        ...course,
        author: course.author ?? course.source,
        language: course.language ?? "Other",
        framework: course.framework ?? null,
        tags: course.tags ?? [],
      };
    });
  }

  async upsert(course: Course): Promise<void> {
    await this.db
      .insert(externalCourses)
      .values({ id: course.id, snapshot: JSON.stringify(course) })
      .onConflictDoUpdate({
        target: externalCourses.id,
        set: { snapshot: JSON.stringify(course) },
      });
  }
}
