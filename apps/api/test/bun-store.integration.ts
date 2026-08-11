import { strict as assert } from "node:assert";
import { BunSqlCourseEventStore } from "../src/bun-sql-event-store";

const store = await BunSqlCourseEventStore.create(":memory:");
const event = {
  instanceId: "raw-project-identifier",
  courseId: "dojocho/effect-ts",
  event: "started" as const,
  kata: "001-basics",
  occurredAt: "2026-08-11T10:00:00.000Z",
};

assert.equal(await store.append(event), true);
assert.equal(await store.append(event), false);
const [stored] = await store.list(event.courseId);
assert.equal(stored.courseId, event.courseId);
assert.equal(stored.event, event.event);
assert.equal(stored.kata, event.kata);
assert.notEqual(stored.instanceId, event.instanceId);
assert.match(stored.instanceId, /^[a-f0-9]{64}$/u);

console.log("bun sql event store: ok");
