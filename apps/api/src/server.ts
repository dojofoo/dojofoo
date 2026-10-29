import { createCoursesApp } from "./app";
import { MemoryCourseAuditStore } from "./course-audit";
import { MemoryCourseEventStore } from "./event-store";
import { GitHubCourseRegistrar } from "./github-registrar";
import {
  LibsqlCourseAuditStore,
  LibsqlCourseStore,
  LibsqlCourseEventStore,
  libsqlConnectionFromEnv,
} from "./libsql-event-store";

const database = libsqlConnectionFromEnv(process.env);
if (!database && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL is required in production so course metrics remain durable.");
}
const eventStore = database
  ? await LibsqlCourseEventStore.create(database)
  : new MemoryCourseEventStore();
const courseStore = database ? await LibsqlCourseStore.create(database) : null;
const auditStore = database ? await LibsqlCourseAuditStore.create(database) : new MemoryCourseAuditStore();
const registrar = new GitHubCourseRegistrar({
  store: courseStore ?? {
    remove: async () => undefined,
    upsert: async () => undefined,
  },
});

export default createCoursesApp({
  ...(courseStore ? { courseStore } : {}),
  eventStore,
  auditStore,
  registrar,
});
