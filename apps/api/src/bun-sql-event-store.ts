import { createHash } from "node:crypto";
import { SQL } from "bun";
import type { CourseEvent } from "./app";
import type { CourseEventStore } from "./event-store";

interface EventRow {
  course_id: string;
  instance_hash: string;
  event: CourseEvent["event"];
  kata: string;
  occurred_at: string | Date;
}

function hashInstanceId(instanceId: string) {
  return createHash("sha256").update(instanceId).digest("hex");
}

export class BunSqlCourseEventStore implements CourseEventStore {
  private constructor(private readonly sql: SQL) {}

  static async create(connectionString: string) {
    const sql = new SQL(connectionString);
    await sql`
      CREATE TABLE IF NOT EXISTS course_events (
        course_id TEXT NOT NULL,
        instance_hash TEXT NOT NULL,
        event TEXT NOT NULL CHECK (event IN ('installed', 'started', 'kata_completed', 'finished')),
        kata TEXT NOT NULL DEFAULT '',
        occurred_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (course_id, instance_hash, event, kata)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS course_events_course_id_idx ON course_events (course_id)`;
    return new BunSqlCourseEventStore(sql);
  }

  async list(courseId: string) {
    const rows = await this.sql<EventRow[]>`
      SELECT course_id, instance_hash, event, kata, occurred_at
      FROM course_events
      WHERE course_id = ${courseId}
      ORDER BY occurred_at ASC
    `;
    return rows.map((row) => ({
      courseId: row.course_id,
      instanceId: row.instance_hash,
      event: row.event,
      occurredAt: row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : String(row.occurred_at),
      ...(row.kata ? { kata: row.kata } : {}),
    }));
  }

  async append(event: CourseEvent) {
    const inserted = await this.sql<{ inserted: number }[]>`
      INSERT INTO course_events (course_id, instance_hash, event, kata, occurred_at)
      VALUES (
        ${event.courseId},
        ${hashInstanceId(event.instanceId)},
        ${event.event},
        ${event.kata ?? ""},
        ${event.occurredAt}
      )
      ON CONFLICT (course_id, instance_hash, event, kata) DO NOTHING
      RETURNING 1 AS inserted
    `;
    return inserted.length > 0;
  }
}
