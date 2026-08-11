import { createCoursesApp } from "./app";
import { courseCatalog } from "./catalog";
import { MemoryCourseEventStore } from "./event-store";
import {
  LibsqlCourseEventStore,
  libsqlConnectionFromEnv,
} from "./libsql-event-store";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const database = libsqlConnectionFromEnv(process.env);
if (!database && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL is required in production so course metrics remain durable.");
}
const eventStore = database
  ? await LibsqlCourseEventStore.create(database)
  : new MemoryCourseEventStore();

createCoursesApp({ courses: courseCatalog, eventStore }).listen(port, ({ hostname, port: listeningPort }) => {
  console.log(`Dojofoo courses API listening on http://${hostname}:${listeningPort}`);
});
