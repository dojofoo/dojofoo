import { createCoursesApp } from "./app";
import { courseCatalog } from "./catalog";
import { BunSqlCourseEventStore } from "./bun-sql-event-store";
import { MemoryCourseEventStore } from "./event-store";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!databaseUrl && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL is required in production so course metrics remain durable.");
}
const eventStore = databaseUrl
  ? await BunSqlCourseEventStore.create(databaseUrl)
  : new MemoryCourseEventStore();

createCoursesApp({ courses: courseCatalog, eventStore }).listen(port, ({ hostname, port: listeningPort }) => {
  console.log(`Dojofoo courses API listening on http://${hostname}:${listeningPort}`);
});
