import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "./app";

describe("API error responses", () => {
  it("returns thrown API failures as JSON", async () => {
    const response = await app.request(
      "/api/workspaces/missing/courses/starter/lessons/001-first",
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      error: "The selected dojo workspace is no longer available.",
    });
  });
});


afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("reports the version, build and folder it was started with", async () => {
  vi.stubEnv("DOJO_UI_VERSION", "1.2.3");
  vi.stubEnv("DOJO_UI_BUILD", "build-1");
  vi.stubEnv("DOJO_PROJECT_ROOT", "/courses/draft");
  const response = await app.request("/api/health");
  expect(await response.json()).toMatchObject({ ok: true, version: "1.2.3", build: "build-1", root: "/courses/draft" });
});

it("offers both bundled onboarding courses without contacting the marketplace", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));
  const response = await app.request("/api/local/courses");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "create-your-own-dojo", title: "Create your own dojo" }),
    expect.objectContaining({ id: "how-to-run-a-dojo", title: "How to run a dojo" }),
  ]));
  expect(network).not.toHaveBeenCalled();
});

it("reports first run and persists anonymous setup outside the workspace", async () => {
  const { mkdtempSync, rmSync, existsSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const home = mkdtempSync(join(tmpdir(), "dojo-setup-"));
  const workspace = join(home, "workspace");
  vi.stubEnv("DOJOFOO_HOME", home);
  vi.stubEnv("DOJO_PROJECT_ROOT", workspace);
  try {
    const initial = await app.request("/api/local/setup");
    expect(initial.status).toBe(200);
    expect(await initial.json()).toMatchObject({ completed: false, workspace, user: { name: "Anonymous" } });
    const saved = await app.request("/api/local/setup", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://dojo.localhost", "X-Forwarded-Host": "dojo.localhost", "X-Forwarded-Proto": "https" },
      body: JSON.stringify({ agents: ["claude", "codex", "pi"], courses: [] }),
    });
    expect(saved.status).toBe(200);
    const resumed = await app.request("/api/local/setup");
    expect(await resumed.json()).toMatchObject({ completed: true, workspace, agents: ["claude", "codex", "pi"], agent: "claude", user: { name: "Anonymous" } });
    expect(existsSync(join(workspace, ".dojorc"))).toBe(false);
    const crossOrigin = await app.request("/api/local/setup", {
      method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "codex", courses: [] }),
    });
    expect(crossOrigin.status).toBe(403);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

it("serves the core inventory without executing installed agents", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const bin = mkdtempSync(join(tmpdir(), "dojo-agents-"));
  for (const name of ["claude", "pi"]) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 23\n", { mode: 0o755 });
  }
  vi.stubEnv("PATH", bin);
  vi.stubEnv("HOME", bin);
  try {
    const response = await app.request("/api/local/agents");
    expect(await response.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "claude", found: true }),
      expect.objectContaining({ id: "pi", found: true }),
      expect.objectContaining({ id: "codex", found: false }),
    ]));
  } finally { rmSync(bin, { recursive: true, force: true }); }
});
