import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { Client } from "@dojofoo/agent/client";
import { afterEach, expect, it, vi } from "vitest";
import { createSenseiRuntime } from "./runtime";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function workspace() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-sensei-runtime-")));
  roots.push(root);
  vi.stubEnv("DOJOFOO_HOME", join(root, "home"));
  await mkdir(join(root, "workspace/.dojo"), { recursive: true });
  await writeFile(join(root, "workspace/.dojo/runtimes.json"), JSON.stringify({ agent: "opencode" }));
  return { root, workspace: join(root, "workspace"), home: join(root, "home") };
}

it("owns a real packaged Sensei server and releases it without launching a model", async () => {
  const { workspace: path } = await workspace();
  const runtime = await createSenseiRuntime(path, { workspaceId: "w1" });
  try {
    const [first, second] = await Promise.all([runtime.start(), runtime.start()]);
    expect(first.url).toBe(second.url);
    const info = await new Client({ baseUrl: first.url, auth: first.auth }).info();
    expect(info.hooks.map(hook => hook.slug)).toContain("dojofoo-lifecycle");
    expect(info.tools.static.map(tool => tool.name).sort()).toEqual(["ask_question", "dojo_context", "dojo_lesson_complete"]);
    await runtime.close();
    await expect(runtime.start()).rejects.toThrow("closed");
    await expect(fetch(first.url, { signal: AbortSignal.timeout(2000) })).rejects.toThrow();
  } finally { await runtime.close(); }
}, 60_000);

it("Sensei's scratch directory is outside the workspace and empty", async () => {
  const { workspace: path, home } = await workspace();
  const runtime = await createSenseiRuntime(path, { workspaceId: "w1" });
  try {
    await runtime.start();
    const saved = JSON.parse(await readFile(join(path, ".dojo/sensei-app/agents/sensei/runtime.json"), "utf8"));
    expect(saved.harnessRoot).toBe(join(home, "state/sensei/w1"));
    expect(relative(path, saved.harnessRoot).startsWith("..")).toBe(true);
    expect(await readdir(join(saved.harnessRoot, "scratch"))).toEqual([]);
    expect(existsSync(join(path, ".dojo/sensei-harness"))).toBe(false);
  } finally { await runtime.close(); }
}, 60_000);

it("the ceiling reaches runtime.json", async () => {
  const { workspace: path } = await workspace();
  const usageCeiling = { newInputTokens: 3_000_000, outputTokens: 300_000 };
  const runtime = await createSenseiRuntime(path, { workspaceId: "w1", usageCeiling });
  try {
    await runtime.start();
    expect(JSON.parse(await readFile(join(path, ".dojo/sensei-app/agents/sensei/runtime.json"), "utf8")).usageCeiling).toEqual(usageCeiling);
  } finally { await runtime.close(); }
  const learner = await createSenseiRuntime(path, { workspaceId: "w1" });
  try {
    await learner.start();
    expect(JSON.parse(await readFile(join(path, ".dojo/sensei-app/agents/sensei/runtime.json"), "utf8"))).not.toHaveProperty("usageCeiling");
  } finally { await learner.close(); }
}, 60_000);

it("runtime.json carries the host port, the agent and the process record", async () => {
  const { workspace: path, home } = await workspace();
  const runtime = await createSenseiRuntime(path, { workspaceId: "w1", hostPortUrl: "http://127.0.0.1:9/api/host-port" });
  try {
    const ready = await runtime.start();
    const saved = JSON.parse(await readFile(join(path, ".dojo/sensei-app/agents/sensei/runtime.json"), "utf8"));
    expect(saved).toMatchObject({
      workspaceRoot: path, workspaceId: "w1", harness: "opencode", stateDirectory: join(home, "state"),
      processRecord: join(home, "state/processes/w1.sensei.jsonl"), auth: { username: "dojo-host", password: ready.secret },
      hostPort: { url: "http://127.0.0.1:9/api/host-port", workspaceId: "w1", persona: "sensei", secret: ready.secret,
        readOnly: { agent: "opencode", stateDirectory: join(home, "state") } },
    });
  } finally { await runtime.close(); }
}, 60_000);
