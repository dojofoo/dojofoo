import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { prepareKyoshiApp, prepareKyoshiCommand, prepareKyoshiHarness } from "./prepare";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function course() {
  const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-prepare-"));
  roots.push(root);
  return root;
}

it("ignores course Kyoshi overrides without overwriting their files", async () => {
  const root = await course();
  const authored = join(root, ".dojo/kyoshi");
  await mkdir(join(authored, "tools"), { recursive: true });
  await mkdir(join(authored, "skills/local"), { recursive: true });
  await writeFile(join(authored, "instructions.md"), "COURSE_KYOSHI: Teach this course's authors.\n");
  await writeFile(join(authored, "tools/course_marker.ts"), "export default 'AUTHOR TOOL';\n");
  await writeFile(join(authored, "skills/local/SKILL.md"), "---\nname: local\ndescription: Course-specific authoring guidance.\n---\nAUTHOR SKILL\n");
  const app = await prepareKyoshiApp(root);
  expect(app).toBe(join(await realpath(root), ".dojo/kyoshi-app/agents/kyoshi"));
  expect(await prepareKyoshiApp(root)).toBe(app);
  expect(await readFile(join(authored, "instructions.md"), "utf8")).toContain("COURSE_KYOSHI");
  expect(await readFile(join(authored, "tools/course_marker.ts"), "utf8")).toContain("AUTHOR TOOL");
  expect(await readFile(join(authored, "skills/local/SKILL.md"), "utf8")).toContain("AUTHOR SKILL");
  await expect(readFile(join(app, "agent.ts"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("provides a private CLI executable with literal paths and arguments", async () => {
  const root = await course();
  const cli = join(root, "owner's cli.mjs");
  await writeFile(cli, "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
  const harness = await prepareKyoshiHarness(root);
  const directory = await prepareKyoshiCommand(harness, cli);
  const args = ["kyoshi", "lesson", "A title with spaces", "$(not-a-command)"];
  expect(JSON.parse(execFileSync(join(directory, "dojofoo"), args, { encoding: "utf8" }))).toEqual(args);
  await expect(prepareKyoshiCommand(harness, join(root, "missing"))).rejects.toThrow();
});

it("prepares private host state without generating agent files or editing the course", async () => {
  const root = await course();
  await writeFile(join(root, "package.json"), '{"name":"human-course"}\n');
  await writeFile(join(root, "DOJO.md"), "Author-owned material\n");
  const app = await prepareKyoshiApp(root);
  expect(await readFile(join(root, ".dojo/kyoshi-app/.gitignore"), "utf8")).toBe("*\n");
  expect(app).toBe(join(await realpath(root), ".dojo/kyoshi-app/agents/kyoshi"));
  expect(await prepareKyoshiApp(root)).toBe(app);
  expect(await readFile(join(root, "package.json"), "utf8")).toBe('{"name":"human-course"}\n');
  expect(await readFile(join(root, "DOJO.md"), "utf8")).toBe("Author-owned material\n");
  await expect(readFile(join(app, "agent.ts"))).rejects.toMatchObject({ code: "ENOENT" });
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
  expect(await readFile(join(harness, ".gitignore"), "utf8")).toBe("*\n");
  expect(harness).toBe(join(await realpath(root), ".dojo/kyoshi-harness"));
  expect(await prepareKyoshiHarness(root)).toBe(harness);
  await writeFile(join(harness, "course", "DOJO.md"), "A live author edit");
  expect(await readFile(join(root, "DOJO.md"), "utf8")).toBe("A live author edit");
});

it("ignores generated secrets even when the course has no ignore file", async () => {
  const root = await course();
  execFileSync("git", ["init", "--quiet", root]);
  await prepareKyoshiApp(root);
  await prepareKyoshiHarness(root);
  for (const path of [".dojo/kyoshi-app/.env", ".dojo/kyoshi-app/agents/kyoshi/.env.production", ".dojo/kyoshi-harness/.env.local", ".dojo/kyoshi-harness/runtime.json"]) {
    expect(execFileSync("git", ["check-ignore", "--no-index", path], { cwd: root, encoding: "utf8" }).trim()).toBe(path);
  }
});
