import { createHash } from "node:crypto";
import { createClient, type Client, type Config } from "@libsql/client/web";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql/web";
import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Course, CourseEvent, CourseStatus } from "./app";
import type { CourseAudit, CourseAuditStore } from "./course-audit";
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
  // A course starts in trial: installable by its repository, left out of the catalog until it's set to enabled here
  status: text("status", { enum: ["trial", "enabled"] }).notNull(),
});

const courseAudits = sqliteTable(
  "course_audits",
  {
    courseId: text("course_id").notNull(),
    provider: text("provider", { enum: ["dojo", "cisco"] }).notNull(),
    hash: text("hash"),
    status: text("status", { enum: ["pass", "warn", "fail"] }).notNull(),
    riskLevel: text("risk_level", { enum: ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"] }).notNull(),
    summary: text("summary").notNull(),
    findings: text("findings").notNull(),
    auditedAt: text("audited_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.courseId, table.provider] })],
);

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
    return LibsqlCourseEventStore.fromClient(createClient(config));
  }

  static async fromClient(client: Client) {
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

  async listAll() {
    const rows = await this.db
      .select()
      .from(courseEvents)
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
    return LibsqlCourseStore.fromClient(createClient(config));
  }

  static async fromClient(client: Client) {
    const db = drizzle(client);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS external_courses (
        id TEXT PRIMARY KEY,
        snapshot TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'enabled'))
      )
    `);
    // Courses listed before trials existed stay listed
    const columns = await db.all<{ name: string }>(sql`PRAGMA table_info(external_courses)`);
    if (!columns.some((column) => column.name === "status")) {
      await db.run(sql`
        ALTER TABLE external_courses
        ADD COLUMN status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('trial', 'enabled'))
      `);
    }
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
        status: row.status,
      };
    });
  }

  /** Stores a course's snapshot: a new course in trial, a known one keeping its status */
  async upsert(course: Course): Promise<CourseStatus> {
    const { status: _status, ...snapshot } = course;
    const row = await this.db
      .insert(externalCourses)
      .values({ id: course.id, snapshot: JSON.stringify(snapshot), status: "trial" })
      .onConflictDoUpdate({
        target: externalCourses.id,
        set: { snapshot: JSON.stringify(snapshot) },
      })
      .returning({ status: externalCourses.status })
      .get();
    return row.status;
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(externalCourses).where(eq(externalCourses.id, id));
  }

  /** Lists a trial course in the catalog (enabled), or takes it back out (trial); false when the course isn't known */
  async setStatus(id: string, status: CourseStatus): Promise<boolean> {
    const rows = await this.db.update(externalCourses).set({ status }).where(eq(externalCourses.id, id)).returning({ id: externalCourses.id });
    return rows.length > 0;
  }
}

export class LibsqlCourseAuditStore implements CourseAuditStore {
  private constructor(private readonly db: ReturnType<typeof drizzle>) {}

  static async create(config: Config) {
    return LibsqlCourseAuditStore.fromClient(createClient(config));
  }

  static async fromClient(client: Client) {
    const db = drizzle(client);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS course_audits (
        course_id TEXT NOT NULL,
        provider TEXT NOT NULL CHECK (provider IN ('dojo', 'cisco')),
        hash TEXT,
        status TEXT NOT NULL CHECK (status IN ('pass', 'warn', 'fail')),
        risk_level TEXT NOT NULL CHECK (risk_level IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
        summary TEXT NOT NULL,
        findings TEXT NOT NULL,
        audited_at TEXT NOT NULL,
        PRIMARY KEY (course_id, provider)
      )
    `);
    return new LibsqlCourseAuditStore(db);
  }

  async list(courseId: string): Promise<CourseAudit[]> {
    const rows = await this.db
      .select()
      .from(courseAudits)
      .where(eq(courseAudits.courseId, courseId))
      .orderBy(asc(courseAudits.provider));
    return rows.map((row) => ({ ...row, findings: JSON.parse(row.findings) as CourseAudit["findings"] }));
  }

  /** The latest audit per provider replaces the one before it */
  async save(audit: CourseAudit): Promise<void> {
    const values = { ...audit, findings: JSON.stringify(audit.findings) };
    await this.db
      .insert(courseAudits)
      .values(values)
      .onConflictDoUpdate({
        target: [courseAudits.courseId, courseAudits.provider],
        set: { hash: values.hash, status: values.status, riskLevel: values.riskLevel, summary: values.summary, findings: values.findings, auditedAt: values.auditedAt },
      });
  }
}
