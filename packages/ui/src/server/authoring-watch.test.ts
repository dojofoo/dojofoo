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
