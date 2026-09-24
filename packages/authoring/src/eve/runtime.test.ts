import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { acquireKyoshiRuntime, createKyoshiRuntime } from "./runtime";

it("keeps native ownership when the UI module graph is invalidated", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-reload-"));
  const load = createRequire(import.meta.url);
  const before = load("@dojofoo/authoring/eve/runtime") as typeof import("./runtime");
  const runtime = await before.acquireKyoshiRuntime(root);
  try {
    vi.resetModules();
    const after = load("@dojofoo/authoring/eve/runtime") as typeof import("./runtime");
    expect(await after.acquireKyoshiRuntime(root)).toBe(runtime);
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("allows explicit acquisition after a failed setup is repaired", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-repair-"));
  const app = join(root, ".dojo/kyoshi-app");
  try {
    await mkdir(app, { recursive: true });
    await writeFile(join(app, "package.json"), JSON.stringify({ name: "unmanaged" }));
    await expect(acquireKyoshiRuntime(root)).rejects.toThrow("unmanaged");
    await rm(join(app, "package.json"));
    const runtime = await acquireKyoshiRuntime(root);
    await runtime.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("shares native runtime ownership across route instances until shutdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-owner-"));
  try {
    const [a, b] = await Promise.all([acquireKyoshiRuntime(root), acquireKyoshiRuntime(root)]);
    expect(a).toBe(b);
    await Promise.all([a.close(), b.close()]);
    const next = await acquireKyoshiRuntime(root);
    expect(next).not.toBe(a);
    await next.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("owns a real packaged Eve server and releases it without launching a model", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-runtime-"));
  const runtime = await createKyoshiRuntime(root);
  try {
    const [first, second] = await Promise.all([runtime.start(), runtime.start()]);
    expect(first.url).toBe(second.url);
    const state = JSON.parse(await readFile(join(root, ".dojo/kyoshi-app/agents/kyoshi/runtime.json"), "utf8"));
    expect(state.courseRoot).toBe(root);
    expect(state.connection.id).toEqual(expect.any(String));
    expect(Object.keys(state).sort()).toEqual(["connection", "courseRoot", "harness", "harnessRoot"]);
    await Promise.all([runtime.close(), runtime.close()]);
    await expect(runtime.start()).rejects.toThrow("closed");
    await expect(fetch(first.url, { signal: AbortSignal.timeout(2000) })).rejects.toThrow();
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
