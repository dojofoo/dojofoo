import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@dojofoo/agent/client";
import { expect, it, vi } from "vitest";
import { acquireKyoshiRuntime, createKyoshiRuntime } from "./runtime";

it("defaults to the native Codex model, preserving saved and explicit selections", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-model-"));
  vi.stubEnv("CODEX_HOME", root);
  vi.stubEnv("DOJOFOO_HOME", root);
  const statePath = join(root, ".dojo/kyoshi-app/agents/kyoshi/runtime.json");
  try {
    await mkdir(join(root, ".dojo"), { recursive: true });
    await writeFile(join(root, ".dojo/runtimes.json"), JSON.stringify({ agent: "codex" }));
    await writeFile(join(root, "config.toml"), 'model = "native-model"\n');
    for (const [options, expected] of [[{}, "native-model"], [{}, "changed-native-model"], [{ model: "selected-model" }, "selected-model"], [{}, "selected-model"]] as const) {
      const runtime = await createKyoshiRuntime(root, options);
      try {
        await runtime.start();
        expect(JSON.parse(await readFile(statePath, "utf8")).model).toBe(expected);
      } finally { await runtime.close(); }
      await writeFile(join(root, "config.toml"), 'model = "changed-native-model"\n');
    }
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("an explicit agent wins over the workspace's selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-agent-"));
  vi.stubEnv("DOJOFOO_HOME", root);
  try {
    await mkdir(join(root, ".dojo"), { recursive: true });
    await writeFile(join(root, ".dojo/runtimes.json"), JSON.stringify({ agent: "codex" }));
    const runtime = await createKyoshiRuntime(root, { agent: "pi" });
    try {
      await runtime.start();
      expect(JSON.parse(await readFile(join(root, ".dojo/kyoshi-app/agents/kyoshi/runtime.json"), "utf8")).harness).toBe("pi");
    } finally { await runtime.close(); }
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("boots shipped Kyoshi in a plain Node process without monorepo module paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-master-native-"));
  await mkdir(join(root, ".dojo/kyoshi"), { recursive: true });
  await writeFile(join(root, ".dojo/kyoshi/instructions.md"), "Help author this course.\n");
  try {
    const entry = join(root, "boot.mjs");
    await writeFile(entry, `
      const { createKyoshiRuntime } = await import(${JSON.stringify(new URL("../../dist/eve/runtime.js", import.meta.url).href)});
      const runtime = await createKyoshiRuntime(process.argv[2]);
      let ready;
      try { ready = await runtime.start(); } finally { await runtime.close(); }
      let responds = false;
      try { await fetch(ready.url, { signal: AbortSignal.timeout(2000) }); responds = true; } catch {}
      if (responds) throw new Error("Native host still responds after shutdown");
      // Match Eve's one-shot CLI lifecycle after verifying owned resources closed.
      process.exit(0);
    `);
    const boot = promisify(execFile)(process.execPath, [entry, root], { timeout: 50_000, env: { ...process.env, NODE_PATH: undefined,
      DOJOFOO_HOME: join(root, "home"), EVE_MOCK_AUTHORED_MODELS: "1" } });
    boot.child.stdout?.on("data", chunk => console.info(String(chunk).trim()));
    await boot;
  } finally { await rm(root, { recursive: true, force: true }); }
}, 90_000);

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

it("uses production Kyoshi for old bindings without stored auth", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-production-"));
  const app = join(root, ".dojo/kyoshi-app/agents/kyoshi");
  await mkdir(join(app, ".eve/dev-runtime"), { recursive: true });
  await writeFile(join(app, "runtime.json"), JSON.stringify({ harness: "opencode" }));
  const runtime = await createKyoshiRuntime(root);
  try {
    const ready = await runtime.start();
    expect((await fetch(new URL("eve/v1/info", ready.url))).status).toBe(401);
    expect(await new Client({ baseUrl: ready.url, auth: ready.auth }).info()).toBeDefined();
  } finally { await runtime.close(); await rm(root, { recursive: true, force: true }); }
}, 20_000);

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
  // Cold native Eve imports take longer than Vitest's default five seconds.
}, 20_000);

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
    // Eve owns generation paths: verify through its manifest-loading API,
    // not an assumed .eve/compile location.
    const info = await new Client({ baseUrl: first.url, auth: first.auth }).info();
    expect(info.skills.static.map((skill: { name: string }) => skill.name).sort())
      .toEqual(["kata-lessons", "lesson-design", "teaching-evals"]);
    await Promise.all([runtime.close(), runtime.close()]);
    await expect(runtime.start()).rejects.toThrow("closed");
    await expect(fetch(first.url, { signal: AbortSignal.timeout(2000) })).rejects.toThrow();
    // Simulate lost generated infrastructure, without deleting harness history.
    await rm(join(root, ".dojo/kyoshi-app"), { recursive: true, force: true });
    const restarted = await createKyoshiRuntime(root);
    try {
      const ready = await restarted.start();
      expect(await new Client({ baseUrl: ready.url, auth: ready.auth }).info()).toBeDefined();
    } finally {
      await restarted.close();
    }
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

it("a new secret on every start, and runtime.json stays 0600", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-secret-"));
  vi.stubEnv("DOJOFOO_HOME", join(root, "home"));
  const runtimePath = join(root, ".dojo/kyoshi-app/agents/kyoshi/runtime.json");
  try {
    const secrets: string[] = [];
    for (let start = 0; start < 2; start++) {
      const runtime = await createKyoshiRuntime(root, { workspaceId: "workspace-1", hostPortUrl: "http://127.0.0.1:9/api/host-port" });
      try {
        const ready = await runtime.start();
        const saved = JSON.parse(await readFile(runtimePath, "utf8"));
        expect(saved.auth.password).toBe(ready.secret);
        expect(saved.hostPort).toEqual({ url: "http://127.0.0.1:9/api/host-port", workspaceId: "workspace-1", persona: "kyoshi", secret: ready.secret });
        expect(saved.processRecord).toBe(join(root, "home/state/processes/workspace-1.kyoshi.jsonl"));
        expect((await stat(runtimePath)).mode & 0o777).toBe(0o600);
        secrets.push(ready.secret);
      } finally { await runtime.close(); }
    }
    expect(secrets[0]).not.toBe(secrets[1]);
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

it("the prepared host lists dojofoo's lifecycle hook", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-hook-"));
  vi.stubEnv("DOJOFOO_HOME", join(root, "home"));
  const runtime = await createKyoshiRuntime(root);
  try {
    const ready = await runtime.start();
    const info = await new Client({ baseUrl: ready.url, auth: ready.auth }).info();
    expect(info.hooks.map(hook => hook.slug)).toContain("dojofoo-lifecycle");
  } finally {
    await runtime.close();
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("an ended session stays readable after a host restart (retention \"default\", open risk 11)", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-retention-"));
  vi.stubEnv("DOJOFOO_HOME", join(root, "home"));
  vi.stubEnv("EVE_MOCK_AUTHORED_MODELS", "1");
  try {
    const first = await createKyoshiRuntime(root);
    let sessionId: string;
    try {
      const ready = await first.start();
      // A bodyless create has no stream to end yet, so the session starts with a turn on Eve's mock model (EVE_MOCK_AUTHORED_MODELS)
      const { session, delivery } = await new Client({ baseUrl: ready.url, auth: ready.auth }).sessions.create({ message: "Hello.", signal: AbortSignal.timeout(20_000) });
      sessionId = session.id;
      await delivery.result({ signal: AbortSignal.timeout(30_000) });
      // The end closes the stream, so its delivery never settles there (Eve docs, "Delivery"); wait for session.ended instead
      await session.end({ signal: AbortSignal.timeout(20_000) });
      for (const deadline = Date.now() + 20_000; Date.now() < deadline; await new Promise(resolve => setTimeout(resolve, 100))) {
        if ((await session.snapshot({ signal: AbortSignal.timeout(5_000) })).events.some(event => event.type === "session.ended")) break;
      }
    } finally { await first.close(); }
    const second = await createKyoshiRuntime(root);
    try {
      const ready = await second.start();
      const snapshot = await new Client({ baseUrl: ready.url, auth: ready.auth }).sessions.attach(sessionId).snapshot({ signal: AbortSignal.timeout(20_000) });
      expect(snapshot.events.map(event => event.type)).toContain("session.ended");
    } finally { await second.close(); }
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
}, 90_000);
