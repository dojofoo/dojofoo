import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { observeWorkspacePath } from "@dojofoo/config/local-state";
import { interactiveRoutes } from "./routes";
import { lessonRoutes } from "../lesson/routes";

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "dojo-interactive-api-"));
  roots.push(root);
  vi.stubEnv("DOJOFOO_HOME", resolve(root, "state"));
  vi.stubEnv("DOJO_PROJECT_ROOT", root);
  writeFileSync(resolve(root, ".dojorc"), JSON.stringify({ currentDojo: "first", currentKata: null, editor: null }));
  mkdirSync(resolve(root, ".dojo"), { recursive: true });
  writeFileSync(resolve(root, ".dojo/runtimes.json"), JSON.stringify({ agent: "opencode" }));
  for (const name of ["first", "second"]) {
    const dir = resolve(root, ".dojos", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "dojo.json"), JSON.stringify({ mode: "interactive", name, version: "0.0.1", description: "Draft", lessons: "lesson.json" }));
    writeFileSync(resolve(dir, "lesson.json"), JSON.stringify({ id: "intro", title: name, steps: [{ id: "read", type: "present", title: name, content: name }] }));
    writeFileSync(resolve(dir, "reference.svg"), `<svg>${name}</svg>`);
  }
  const workspace = observeWorkspacePath(root);
  const app = new Hono().route("/api/interactive", interactiveRoutes)
    .route("/api/workspaces", lessonRoutes)
    .route("/api/workspaces/:workspaceId/courses/:courseId/interactive", interactiveRoutes);
  app.onError((error, c) => c.json({ error: error.message }, 500));
  return { app, root, base: `/api/workspaces/${workspace}/courses/second/interactive` };
}

describe("interactive course API", () => {
  it("addresses the exact course and its assets while keeping the old entry working", async () => {
    const { app, base } = fixture();
    expect(await (await app.request(base)).json()).toMatchObject({ dojo: "second", complete: false });
    expect(await (await app.request(`${base}/asset?path=reference.svg`)).text()).toBe("<svg>second</svg>");
    expect(await (await app.request(base.replace(/interactive$/, "lessons/read/progressions"), { method: "POST" })).json()).toMatchObject({ dojo: "second", complete: true });
    expect(await (await app.request("/api/interactive")).json()).toMatchObject({ dojo: "first", complete: false });
    expect((await app.request(base.replace("second", "missing"))).status).toBe(500);
  });

  it("advances only through the existing progression route after a question is answered", async () => {
    const { app, root, base } = fixture();
    writeFileSync(resolve(root, ".dojos/second/lesson.json"), JSON.stringify({ id: "intro", title: "Second", steps: [
      { id: "read", type: "present", title: "Read", content: "Read this." },
      { id: "recall", type: "question", title: "Recall", prompt: "What?", answers: ["this"], explanation: "It was this." },
    ] }));
    const next = (id: string) => app.request(base.replace(/interactive$/, `lessons/${id}/progressions`), { method: "POST" });
    expect(await (await next("read")).json()).toMatchObject({ step: 1, current: { id: "recall" } });
    expect((await next("read")).status).toBe(409);
    expect((await next("recall")).status).toBe(409);
    const answered = await app.request(`${base}/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: "this" }) });
    expect(await answered.json()).toMatchObject({ step: 1, response: { correct: true } });
    expect(await (await app.request(base)).json()).toMatchObject({ step: 1 });
    expect(await (await next("recall")).json()).toMatchObject({ step: 2, complete: true });
    expect((await app.request(`${base}/advance`, { method: "POST" })).status).toBe(404);
  });

  it("the removed conversation, configuration and messages routes answer 404", async () => {
    const { app, base } = fixture();
    for (const [method, path] of [["GET", "/conversation"], ["PUT", "/configuration/harness"], ["PUT", "/configuration/model"], ["POST", "/messages"]] as const) {
      const response = await app.request(`${base}${path}`, { method, headers: { "content-type": "application/json" }, ...(method === "GET" ? {} : { body: "{}" }) });
      expect(response.status, `${method} ${path}`).toBe(404);
    }
    expect((await app.request(base)).status).toBe(200);
  });
});
