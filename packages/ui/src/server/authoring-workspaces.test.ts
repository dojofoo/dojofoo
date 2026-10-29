import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { expect, it, onTestFinished, vi } from "vitest";
import { mountLocalEveAuthoring } from "./authoring-workspaces";

function roots() {
  const first = mkdtempSync(join(tmpdir(), "dojo-authoring-first-"));
  const second = mkdtempSync(join(tmpdir(), "dojo-authoring-second-"));
  onTestFinished(() => { rmSync(first, { recursive: true, force: true }); rmSync(second, { recursive: true, force: true }); });
  return { first: realpathSync(first), second: realpathSync(second) };
}

it("keeps one local host per canonical workspace and forwards mounted request bodies without sharing owners", async () => {
  const { first, second } = roots();
  const servers = [first, second].map((root, i) => ({ root, start: vi.fn(async () => ({ url: `http://127.0.0.1:${2000 + i}` })), close: vi.fn(async () => {}) }));
  const runtime = vi.fn(async (root: string) => servers.find(server => server.root === root)!);
  const routes = new Hono();
  const close = mountLocalEveAuthoring(routes, { runtime, resolveWorkspace: request => new URL(request.url).searchParams.get("workspace") === "second" ? second : first });
  const app = new Hono().route("/api/authoring", routes);
  const responses = await Promise.all([app.request("/api/authoring/backend"), app.request("/api/authoring/backend"), app.request("/api/authoring/backend?workspace=second")]);
  expect(responses.map(response => response.status)).toEqual([200, 200, 200]);
  expect(runtime.mock.calls.map(([root]) => root).sort()).toEqual([first, second].sort());
  expect(servers.map(server => server.start.mock.calls.length)).toEqual([1, 1]);
  const response = await app.request("/api/authoring/eve/sessions?workspace=second", { method: "POST", body: JSON.stringify({ message: 42 }) });
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: "Message is required" });
  await Promise.all([close(), close()]);
  expect(servers.map(server => server.close.mock.calls.length)).toEqual([1, 1]);
  expect((await app.request("/api/authoring/backend")).status).toBe(503);
  expect(runtime).toHaveBeenCalledTimes(2);
});

it("retries only a requested failed workspace and leaves the other owned host running", async () => {
  const { first, second } = roots();
  const server = { start: vi.fn(async () => ({ url: "http://127.0.0.1:2000" })), close: vi.fn(async () => {}) };
  let failed = false;
  const runtime = vi.fn(async (root: string) => { if (root === first && !failed) { failed = true; throw new Error("Repair this draft"); } return server; });
  const app = new Hono();
  const close = mountLocalEveAuthoring(app, { runtime, resolveWorkspace: request => new URL(request.url).searchParams.has("second") ? second : first });
  expect((await app.request("/backend")).status).toBe(503);
  expect(runtime).toHaveBeenCalledTimes(1);
  expect((await app.request("/backend?second=1")).status).toBe(200);
  expect((await app.request("/backend")).status).toBe(200);
  expect(runtime.mock.calls.map(([root]) => root)).toEqual([first, second, first]);
  expect(server.close).not.toHaveBeenCalled();
  await close();
});

it("closes every owned host even if one close fails, and does not acquire an unused host", async () => {
  const { first, second } = roots();
  const closed: string[] = [];
  const runtime = vi.fn(async (root: string) => ({ start: async () => ({ url: "http://127.0.0.1:2000" }), close: async () => { closed.push(root); if (root === first) throw new Error("Close failed"); } }));
  const unused = mountLocalEveAuthoring(new Hono(), { runtime, resolveWorkspace: () => first });
  await unused();
  expect(runtime).not.toHaveBeenCalled();
  const app = new Hono();
  const close = mountLocalEveAuthoring(app, { runtime, resolveWorkspace: request => new URL(request.url).searchParams.has("second") ? second : first });
  await app.request("/backend");
  await app.request("/backend?second=1");
  await expect(close()).rejects.toThrow();
  expect(closed.sort()).toEqual([first, second].sort());
});
