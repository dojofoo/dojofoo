import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { readDojoRc } from "@dojofoo/config";
import * as preparation from "@dojofoo/config/project-preparation";
import * as service from "./service";
import { lessonRoutes } from "./routes";

// The workspace every request names; a test with real files points it at its own folder
const workspace = vi.hoisted(() => ({ root: "/course" }));
vi.mock("../control/workspace", () => ({ resolveWorkspaceId: () => workspace.root }));
// The real CLI unless a test scripts its answer
vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFile: vi.fn(actual.execFile) };
});
const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  workspace.root = "/course";
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A workspace whose current course is `starter`, with a second kata course `other` last active on its second lesson */
function twoCourses() {
  const root = mkdtempSync(join(tmpdir(), "dojofoo-current-course-"));
  roots.push(root);
  writeFileSync(resolve(root, ".dojorc"), JSON.stringify({ currentDojo: "starter", currentKata: "001-first", editor: null,
    progress: { starter: { completed: [], lastActive: "001-first" }, other: { completed: ["001-first"], lastActive: "002-second" } } }));
  for (const course of ["starter", "other"]) {
    const lessons = ["001-first", "002-second"];
    for (const lesson of lessons) {
      mkdirSync(resolve(root, ".dojos", course, "katas", lesson), { recursive: true });
      writeFileSync(resolve(root, ".dojos", course, "katas", lesson, "SENSEI.md"), `# ${lesson}\n\nPractice.`);
      writeFileSync(resolve(root, ".dojos", course, "katas", lesson, "solution.ts"), "export const answer = 0;\n");
    }
    writeFileSync(resolve(root, ".dojos", course, "dojo.yaml"), [`name: '@test/${course}'`, "version: 1.0.0", "description: Katas", "test: echo ok", "katas:",
      ...lessons.flatMap(lesson => [`  - name: ${lesson}`, `    template: katas/${lesson}/solution.ts`])].join("\n"));
  }
  workspace.root = root;
  return root;
}

it("GET a lesson ignores prepare and never opens a conversation", async () => {
  const root = twoCourses();
  const plain = await (await lessonRoutes.request("/workspace/courses/starter/lessons/001-first")).json();
  const prepared = await (await lessonRoutes.request("/workspace/courses/starter/lessons/001-first?prepare=true")).json();
  expect(prepared).toEqual(plain);
  expect(plain).toMatchObject({ dojo: "starter", kata: "001-first", harness: expect.any(String) });
  for (const field of ["sessionId", "model", "harnesses", "messages", "checkpointed"]) expect(plain).not.toHaveProperty(field);
  expect(existsSync(resolve(root, ".dojo/web.json"))).toBe(false);
  // The conversation routes of the ACP lesson are gone
  for (const [method, path] of [["GET", "messages"], ["POST", "messages"], ["POST", "sessions"], ["PUT", "configuration/model"]]) {
    expect((await lessonRoutes.request(`/workspace/courses/starter/lessons/001-first/${path}`, { method })).status).toBe(404);
  }
});

it("GET checks and files serve a course that is not current", async () => {
  const read = vi.spyOn(service, "readLesson").mockResolvedValue({ dojo: "other-course", result: { passed: 1, total: 1 } } as service.LessonSnapshot);
  const file = vi.spyOn(service, "readLessonFile").mockResolvedValue({ type: "lesson-files", id: "solution" } as service.LessonFileResource);
  const checks = await lessonRoutes.request("/workspace/courses/other-course/lessons/first/checks");
  expect(checks.status).toBe(200);
  expect(await checks.json()).toEqual({ data: [{ type: "checks", id: "latest", attributes: { passed: 1, total: 1 } }] });
  expect(read).toHaveBeenCalledWith("/course", "other-course", "first");
  expect((await lessonRoutes.request("/workspace/courses/other-course/lessons/first/files/solution")).status).toBe(200);
  expect(file).toHaveBeenCalledWith("/course", "other-course", "first", "solution");
});

it("POST current makes the course current with its last active lesson", async () => {
  const root = twoCourses();
  const response = await lessonRoutes.request("/workspace/courses/other/current", { method: "POST" });
  expect(response.status).toBe(204);
  expect(readDojoRc(root)).toMatchObject({ currentDojo: "other", currentKata: "002-second" });
  // Its lessons now read as the current course's
  expect(await (await lessonRoutes.request("/workspace/courses/other/lessons/002-second?prepare=false")).json()).toMatchObject({ courseCurrent: true });
});

it("POST current refuses a foreign Origin", async () => {
  const root = twoCourses();
  const response = await lessonRoutes.request("http://localhost/workspace/courses/other/current", { method: "POST", headers: { Origin: "https://foreign.invalid" } });
  expect(response.status).toBe(403);
  expect(readDojoRc(root)).toMatchObject({ currentDojo: "starter", currentKata: "001-first" });
  // The page's own origin may
  expect((await lessonRoutes.request("http://localhost/workspace/courses/other/current", { method: "POST", headers: { Origin: "http://localhost" } })).status).toBe(204);
});

it("opening and checking a lesson of another course leaves currentDojo unchanged (D30)", async () => {
  const root = twoCourses();
  const lesson = await lessonRoutes.request("/workspace/courses/other/lessons/001-first?prepare=false");
  expect(lesson.status).toBe(200);
  expect(await lesson.json()).toMatchObject({ dojo: "other", kata: "001-first", courseCurrent: false });
  vi.spyOn(preparation, "prepareWorkspace").mockResolvedValue(undefined as never);
  vi.mocked(execFile).mockImplementationOnce(((_command: string, _args: string[], _options: unknown, done: (error: null, stdout: string) => void) => { done(null, JSON.stringify({ total: 1, passed: 1, failed: 0, tests: [{ name: "answers", status: "passed" }], error: null })); return {}; }) as never);
  const checked = await lessonRoutes.request("/workspace/courses/other/lessons/001-first/checks", { method: "POST" });
  expect(checked.status).toBe(201);
  expect(readDojoRc(root)).toMatchObject({ currentDojo: "starter", currentKata: "001-first" });
  expect(await (await lessonRoutes.request("/workspace/courses/starter/lessons/001-first?prepare=false")).json()).toMatchObject({ courseCurrent: true });
});
