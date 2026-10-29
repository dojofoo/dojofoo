import { LibsqlCourseStore, libsqlConnectionFromEnv } from "../src/libsql-event-store";

/*
 * Lists a trial course in the catalog, or takes it back out: `bun scripts/enable-course.ts owner/repository [--trial]`.
 * Needs DATABASE_URL (with TURSO_AUTH_TOKEN), as the API does; the catalog shows the change within its 30 second cache.
 */

const [id] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!id || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(id)) throw new Error("Usage: bun scripts/enable-course.ts owner/repository [--trial]");
const database = libsqlConnectionFromEnv(process.env);
if (!database) throw new Error("DATABASE_URL is required.");
const status = process.argv.includes("--trial") ? "trial" : "enabled";
const courses = await LibsqlCourseStore.create(database);
if (!(await courses.setStatus(id, status))) throw new Error(`${id} isn't registered yet: it registers the first time someone installs it.`);
console.log(`${id}: ${status === "enabled" ? "listed in the catalog" : "back in trial, out of the catalog"}`);
