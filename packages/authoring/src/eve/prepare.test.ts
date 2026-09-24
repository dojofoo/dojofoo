import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { prepareKyoshiApp, prepareKyoshiHarness } from "./prepare";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function course() {
  const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-prepare-"));
  roots.push(root);
  return root;
}

it("prepares an Eve app without installing into or editing the course", async () => {
  const root = await course();
  await writeFile(join(root, "package.json"), '{"name":"human-course"}\n');
  await writeFile(join(root, "DOJO.md"), "Author-owned material\n");
  const app = await prepareKyoshiApp(root);
  expect(app).toBe(join(await realpath(root), ".dojo/kyoshi-app/agents/kyoshi"));
  expect(await prepareKyoshiApp(root)).toBe(app);
  expect(await readFile(join(root, "package.json"), "utf8")).toBe('{"name":"human-course"}\n');
  expect(await readFile(join(root, "DOJO.md"), "utf8")).toBe("Author-owned material\n");
  expect(await readFile(join(app, "agent.ts"), "utf8")).toContain("createKyoshiAgent");
  expect(await readFile(join(app, "tools/dojo_ui_ask.ts"), "utf8")).toContain("@dojofoo/authoring/eve/ask");
  expect(await readFile(join(app, "sandbox/sandbox.ts"), "utf8")).toContain("createAuthoringSandbox");
  expect(await readFile(join(app, "../../package.json"), "utf8")).not.toContain('"eve"');
  expect(await readFile(join(app, "../../node_modules/@dojofoo/agent/package.json"), "utf8")).toContain('"@dojofoo/agent"');
});

it("refuses to overwrite an unrelated app", async () => {
  const root = await course();
  const app = join(root, ".dojo/kyoshi-app");
  await mkdir(app, { recursive: true });
  await writeFile(join(app, "package.json"), '{"name":"mine"}');
  await expect(prepareKyoshiApp(root)).rejects.toThrow("unmanaged Kyoshi app");
  expect(await readFile(join(app, "package.json"), "utf8")).toBe('{"name":"mine"}');
});

it("separates bootstrap files from the live course without copying it", async () => {
  const root = await course();
  const harness = await prepareKyoshiHarness(root);
  expect(harness).toBe(join(await realpath(root), ".dojo/kyoshi-harness"));
  expect(await prepareKyoshiHarness(root)).toBe(harness);
  await writeFile(join(harness, "course", "DOJO.md"), "A live author edit");
  expect(await readFile(join(root, "DOJO.md"), "utf8")).toBe("A live author edit");
});
