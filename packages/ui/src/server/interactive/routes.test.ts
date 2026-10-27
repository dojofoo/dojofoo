import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { observeWorkspacePath } from "@dojofoo/config/local-state";
import { interactiveRoutes } from "./routes";
import { acpClient } from "../lesson/codex-client";

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "dojo-interactive-api-"));
  roots.push(root);
  vi.stubEnv("DOJOFOO_HOME", resolve(root, "state"));
  vi.stubEnv("DOJO_PROJECT_ROOT", root);
  writeFileSync(resolve(root, ".dojorc"), JSON.stringify({ currentDojo: "first", currentKata: null, editor: null }));
  for (const name of ["first", "second"]) {
    const dir = resolve(root, ".dojos", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "dojo.json"), JSON.stringify({ mode: "interactive", name, version: "0.0.1", description: "Draft", lessons: "lesson.json" }));
    writeFileSync(resolve(dir, "lesson.json"), JSON.stringify({ id: "intro", title: name, steps: [{ id: "read", type: "present", title: name, content: name }] }));
    writeFileSync(resolve(dir, "reference.svg"), `<svg>${name}</svg>`);
  }
  const workspace = observeWorkspacePath(root);
  const app = new Hono().route("/api/interactive", interactiveRoutes)
    .route("/api/workspaces/:workspaceId/courses/:courseId/interactive", interactiveRoutes);
  app.onError((error, c) => c.json({ error: error.message }, 500));
  return { app, base: `/api/workspaces/${workspace}/courses/second/interactive` };
}

describe("interactive course API", () => {
  it("addresses the exact course and its assets while keeping the old entry working", async () => {
    const { app, base } = fixture();
    expect(await (await app.request(base)).json()).toMatchObject({ dojo: "second", complete: false });
    expect(await (await app.request(`${base}/asset?path=reference.svg`)).text()).toBe("<svg>second</svg>");
    expect(await (await app.request(`${base}/advance`, { method: "POST" })).json()).toMatchObject({ dojo: "second", complete: true });
    expect(await (await app.request("/api/interactive")).json()).toMatchObject({ dojo: "first", complete: false });
    expect((await app.request(base.replace("second", "missing"))).status).toBe(500);
  });

  it("streams through the existing native bridge without making course reads depend on the provider", async () => {
    const { app, base } = fixture();
    vi.spyOn(acpClient, "startThread").mockResolvedValue("native-api");
    vi.spyOn(acpClient, "resumeThread").mockResolvedValue();
    vi.spyOn(acpClient, "send").mockImplementation(async (_id, _message, onPart) => {
      onPart?.({ type: "text-start", id: "reply" });
      onPart?.({ type: "text-delta", id: "reply", delta: "Read the current material." });
      onPart?.({ type: "text-end", id: "reply" });
      return "Read the current material.";
    });
    expect(await (await app.request(`${base}/conversation`)).json()).toEqual({ sessionId: null, messages: [], model: null });
    const response = await app.request(`${base}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      threadId: "interactive-api", runId: "test-turn", messages: [{ id: "question", role: "user", content: "Where am I?" }], tools: [], context: [],
    }) });
    const events = await response.text();
    expect(response.status, events).toBe(200);
    expect(events).toContain("Read the current material.");
    expect(events).toContain("RUN_FINISHED");
    expect(acpClient.send).toHaveBeenCalledWith("native-api", "Where am I?", expect.any(Function), expect.any(Object));
    vi.mocked(acpClient.resumeThread).mockRejectedValueOnce(new Error("Provider offline"));
    expect(await (await app.request(`${base}/conversation`)).json()).toEqual({ error: "Provider offline" });
    expect((await app.request(base)).status).toBe(200);
  });
});
