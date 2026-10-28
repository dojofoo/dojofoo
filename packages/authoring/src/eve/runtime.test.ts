import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { courseFileFilter } from "@dojofoo/config";
import { Client } from "@dojofoo/agent/client";
import { expect, it, vi } from "vitest";
import { acquireKyoshiRuntime, createKyoshiRuntime } from "./runtime";
import { buildCourseKyoshi } from "./build";

it("boots a master in a plain Node process without monorepo module paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-master-native-"));
  await mkdir(join(root, ".dojo/kyoshi"), { recursive: true });
  await writeFile(join(root, ".dojo/kyoshi/instructions.md"), "Help author this course.\n");
  try {
    const began = performance.now();
    await buildCourseKyoshi(root);
    console.info(`Plain Node course preparation: ${Math.round(performance.now() - began)}ms`);
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

it("installs an authored master and retains its course tool and skill when installed elsewhere", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-master-kyoshi-runtime-"));
  const authored = join(root, ".dojo/kyoshi");
  await mkdir(join(authored, "tools"), { recursive: true });
  await mkdir(join(authored, "skills/course-specific"), { recursive: true });
  await writeFile(join(authored, "instructions.md"), "MASTER_KYOSHI: Help author this specific course.\n");
  await writeFile(join(authored, "tools/course_question.ts"), 'export { default } from "@dojofoo/agent/tools/ask_question";\n');
  await writeFile(join(authored, "skills/course-specific/SKILL.md"), "---\nname: course-specific\ndescription: Design this course's examples.\n---\nMASTER_SKILL\n");
  await buildCourseKyoshi(root);
  const runtime = await createKyoshiRuntime(root);
  try {
    const ready = await runtime.start();
    const info = await new Client({ host: ready.url, auth: ready.auth }).info();
    expect(info.skills.static.map((skill: { name: string }) => skill.name)).toContain("course-specific");
    expect(JSON.stringify(info)).toContain("course_question");
    expect(await readFile(join(authored, "instructions.md"), "utf8")).toContain("MASTER_KYOSHI");
    await expect(readFile(join(authored, "package.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(authored, "node_modules"))).rejects.toMatchObject({ code: "ENOENT" });
    await runtime.close();
    const installed = await mkdtemp(join(tmpdir(), "dojo-master-kyoshi-copy-"));
    try {
      const include = courseFileFilter(root, true);
      await cp(root, installed, { recursive: true, filter: path => include(relative(root, path)) });
      await buildCourseKyoshi(installed);
      const reopened = await createKyoshiRuntime(installed);
      try {
        const ready = await reopened.start();
        expect(JSON.stringify(await new Client({ host: ready.url, auth: ready.auth }).info())).toContain("course_question");
      } finally { await reopened.close(); }
    } finally { await rm(installed, { recursive: true, force: true }); }
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
}, 150_000);

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
    expect(state.connection.id).toEqual(expect.any(String));
    // Eve owns generation paths: verify through its manifest-loading API,
    // not an assumed .eve/compile location.
    const info = await new Client({ host: first.url, auth: first.auth }).info();
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
      expect(await new Client({ host: ready.url, auth: ready.auth }).info()).toBeDefined();
    } finally {
      await restarted.close();
    }
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
