import { mkdtemp, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAuthoringWatchers } from "./authoring-watch";

const watchers = createAuthoringWatchers();
let root: string;
afterEach(async () => {
  await watchers.close();
  if (root) await rm(root, { recursive: true, force: true });
});

it("notifies both tabs for external create, edit, rename and delete; stops after unsubscribe", async () => {
  root = await mkdtemp(join(tmpdir(), "dojo-authoring-watch-"));
  const first: unknown[] = [], second: unknown[] = [];
  const stopFirst = watchers.subscribe(root, event => first.push(event));
  const stopSecond = watchers.subscribe(root, event => second.push(event));
  await expect.poll(() => first.length).toBe(1);
  await expect.poll(() => second.length).toBe(1);
  const lesson = join(root, "src/001-example");
  await mkdir(lesson, { recursive: true });
  await writeFile(join(lesson, "SENSEI.md"), "# Lesson");
  await expect.poll(() => first.length).toBeGreaterThan(1);
  await expect.poll(() => second.length).toBe(first.length);
  let previous = first.length;
  await writeFile(join(lesson, "SENSEI.md"), "# Updated");
  await expect.poll(() => first.length).toBeGreaterThan(previous);
  previous = first.length;
  await rename(lesson, join(root, "src/002-renamed"));
  await expect.poll(() => first.length).toBeGreaterThan(previous);
  previous = first.length;
  await rm(join(root, "src/002-renamed"), { recursive: true });
  await expect.poll(() => first.length).toBeGreaterThan(previous);
  await stopFirst();
  const count = first.length;
  previous = second.length;
  await writeFile(join(root, "DOJO.md"), "# Course");
  await expect.poll(() => second.length).toBeGreaterThan(previous);
  expect(first.length).toBe(count);
  await stopSecond();
});

it("ignores runtime, dependencies and secrets; reconnect gets a fresh notification", async () => {
  root = await mkdtemp(join(tmpdir(), "dojo-authoring-watch-"));
  const notices: unknown[] = [];
  const stop = watchers.subscribe(root, event => notices.push(event));
  await expect.poll(() => notices.length).toBe(1);
  for (const directory of [".dojo", "node_modules", ".git"]) {
    await mkdir(join(root, directory));
    await writeFile(join(root, directory, "file"), "ignored");
  }
  await writeFile(join(root, ".env"), "fake-fixture-value");
  await new Promise(resolve => setTimeout(resolve, 500));
  expect(notices).toHaveLength(1);
  await stop();
  await writeFile(join(root, "DOJO.md"), "# While disconnected");
  watchers.subscribe(root, event => notices.push(event));
  await expect.poll(() => notices.length).toBe(2);
});

it("refreshes agent-written evaluation reports without watching private evidence", async () => {
  root = await mkdtemp(join(tmpdir(), "dojo-authoring-report-"));
  const directory = join(root, ".dojo/evaluations/run-fixture");
  const notices: unknown[] = [];
  watchers.subscribe(root, event => notices.push(event));
  await expect.poll(() => notices.length).toBe(1);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "material.json"), "private fixture");
  await new Promise(resolve => setTimeout(resolve, 500));
  expect(notices).toHaveLength(1);
  await writeFile(join(directory, "report.json"), JSON.stringify({ status: "running" }));
  await expect.poll(() => notices.length).toBe(2);
  await writeFile(join(directory, "report.json"), JSON.stringify({ status: "passed" }));
  await expect.poll(() => notices.length).toBe(3);
  expect(notices).toEqual(Array.from({ length: 3 }, () => ({ method: "workspace.changed" })));
});

it("a draft's paused Kyoshi turn is cancelled 30 s after its last authoring socket closes", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const { observeWorkspacePath } = await import("@dojofoo/config/local-state");
  const { createLocalAgentRuntime } = await import("./agent-api");
  const { authoringWatchers } = await import("./authoring-watch");
  const { fakeEve } = await import("./agent-session/test-eve.fixture");
  const { vi } = await import("vitest");
  const eve = await fakeEve();
  const draft = mkdtempSync(join(tmpdir(), "dojo-draft-leave-"));
  const stateHome = mkdtempSync(join(tmpdir(), "dojo-draft-leave-home-"));
  try {
    mkdirSync(resolve(draft, ".dojo"), { recursive: true });
    writeFileSync(resolve(draft, "dojo.yaml"), "name: draft\nversion: 1.0.0\ndescription: Draft\nkatas: []\n");
    writeFileSync(resolve(draft, ".dojo/runtimes.json"), JSON.stringify({ agent: "codex" }));
    const workspaceId = observeWorkspacePath(draft, { stateHome, kind: "draft" });
    const local = createLocalAgentRuntime({ state: { stateHome }, runtime: async () => ({ start: async () => ({ url: eve.url, secret: "d".repeat(64) }), close: async () => {} }) });
    await local.connect(workspaceId, { agent: "codex", persona: "kyoshi" });
    await local.sessions.save(workspaceId, { id: "k-paused", agent: "codex", persona: "kyoshi", createdAt: new Date().toISOString(), revision: 0,
      lifecycle: { status: "paused", turnId: "turn_4", updatedAt: new Date().toISOString() } });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    const stop = authoringWatchers.subscribe(draft, () => {});
    await stop();
    await vi.advanceTimersByTimeAsync(29_000);
    expect(eve.cancels).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_500);
    await vi.waitFor(() => expect(eve.cancels).toEqual([{ sessionId: "k-paused", body: { turnId: "turn_4" } }]));
    // A socket that opens again within the bound keeps a later pause
    const again = authoringWatchers.subscribe(draft, () => {});
    await again();
    const reopened = authoringWatchers.subscribe(draft, () => {});
    await vi.advanceTimersByTimeAsync(40_000);
    expect(eve.cancels).toHaveLength(1);
    await reopened();
    await local.stop(workspaceId, "codex");
  } finally {
    vi.useRealTimers();
    await eve.close();
    rmSync(draft, { recursive: true, force: true });
    rmSync(stateHome, { recursive: true, force: true });
  }
});
