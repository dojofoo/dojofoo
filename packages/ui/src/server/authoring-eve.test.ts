import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { mountEveAuthoring } from "./authoring-eve";

describe("authoring Eve mount", () => {
  function workspace() {
    const root = mkdtempSync(join(tmpdir(), "dojo-eve-owned-"));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    return { root: () => root, resolveWorkspace: () => root };
  }

  it("starts one owned host for concurrent requests and closes it once", async () => {
    const ready = Promise.withResolvers<{ url: string }>();
    const server = { start: vi.fn(() => ready.promise), close: vi.fn(async () => {}) };
    const runtime = vi.fn(async () => server);
    const app = new Hono();
    const close = mountEveAuthoring(app, { ...workspace(), runtime });
    expect(runtime).not.toHaveBeenCalled();
    const requests = [app.request("/backend"), app.request("/backend")];
    ready.resolve({ url: "http://127.0.0.1:2000" });
    expect(await Promise.all(requests.map(async response => (await response).json())))
      .toEqual([{ backend: "eve" }, { backend: "eve" }]);
    expect(runtime).toHaveBeenCalledTimes(1);
    expect(server.start).toHaveBeenCalledTimes(1);
    await Promise.all([close(), close()]);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect((await app.request("/backend")).status).toBe(503);
  });

  it("does not start an unused host during shutdown", async () => {
    const runtime = vi.fn();
    const close = mountEveAuthoring(new Hono(), { ...workspace(), runtime });
    await close();
    expect(runtime).not.toHaveBeenCalled();
  });

  it("does not take ownership of an explicitly supplied host", async () => {
    const runtime = vi.fn();
    const app = new Hono();
    const close = mountEveAuthoring(app, { ...workspace(), host: "http://127.0.0.1:2000", runtime });
    expect((await app.request("/backend")).status).toBe(200);
    await close();
    expect(runtime).not.toHaveBeenCalled();
  });

  it("surfaces a failed startup without retrying or switching to ACP", async () => {
    const server = { start: vi.fn(async () => { throw new Error("Harness runtime unavailable"); }), close: vi.fn(async () => {}) };
    const app = new Hono();
    const close = mountEveAuthoring(app, { ...workspace(), runtime: async () => server });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await app.request("/backend");
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Harness runtime unavailable" });
    }
    expect(server.start).toHaveBeenCalledTimes(1);
    await close();
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it("waits for an in-progress startup before releasing its host", async () => {
    const ready = Promise.withResolvers<{ url: string }>();
    const starting = Promise.withResolvers<void>();
    const server = { start: () => { starting.resolve(); return ready.promise; }, close: vi.fn(async () => {}) };
    const app = new Hono();
    const close = mountEveAuthoring(app, { ...workspace(), runtime: async () => server });
    const request = app.request("/backend");
    await starting.promise;
    const closing = close();
    expect(server.close).not.toHaveBeenCalled();
    ready.resolve({ url: "http://127.0.0.1:2000" });
    await Promise.all([request, closing]);
    expect(server.close).toHaveBeenCalledTimes(1);
  });
  it("leaves ACP unchanged when no Eve host was configured", async () => {
    const app = new Hono();
    const root = vi.fn(() => { throw new Error("Must not resolve an Eve workspace"); });
    mountEveAuthoring(app, { root, resolveWorkspace: root });
    expect(await (await app.request("/backend")).json()).toEqual({ backend: "acp" });
    expect((await app.request("/eve/sessions", { method: "POST" })).status).toBe(404);
    expect(root).not.toHaveBeenCalled();
  });

  it("mounts the configured host only for its own workspace", async () => {
    const root = mkdtempSync(join(tmpdir(), "dojo-eve-mount-"));
    const other = mkdtempSync(join(tmpdir(), "dojo-eve-other-"));
    onTestFinished(() => { rmSync(root, { recursive: true, force: true }); rmSync(other, { recursive: true, force: true }); });
    const app = new Hono();
    mountEveAuthoring(app, { host: "http://127.0.0.1:2000", root: () => root, resolveWorkspace: request => new URL(request.url).searchParams.has("other") ? other : root });
    expect(await (await app.request("/backend")).json()).toEqual({ backend: "eve" });
    expect((await app.request("/backend?other=1")).status).toBe(403);
    expect((await app.request("/eve/sessions?other=1", { method: "POST", body: JSON.stringify({ message: "Hello" }) })).status).toBe(403);
    // Input validation proves the mounted route was reached, without inference.
    expect((await app.request("/eve/sessions", { method: "POST", body: "{}" })).status).toBe(422);
  });
});
