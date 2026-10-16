import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { prepareKyoshiApp, prepareKyoshiCommand, prepareKyoshiHarness } from "./prepare";
import { kyoshiSkills } from "./instructions";
import { readPrompt } from "../prompts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function course() {
  const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-prepare-"));
  roots.push(root);
  return root;
}

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

it("prepares an Eve app without installing into or editing the course", async () => {
  const root = await course();
  await writeFile(join(root, "package.json"), '{"name":"human-course"}\n');
  await writeFile(join(root, "DOJO.md"), "Author-owned material\n");
  const app = await prepareKyoshiApp(root);
  expect(await readFile(join(root, ".dojo/kyoshi-app/.gitignore"), "utf8")).toBe("*\n");
  expect(app).toBe(join(await realpath(root), ".dojo/kyoshi-app/agents/kyoshi"));
  expect(await prepareKyoshiApp(root)).toBe(app);
  expect(await readFile(join(root, "package.json"), "utf8")).toBe('{"name":"human-course"}\n');
  expect(await readFile(join(root, "DOJO.md"), "utf8")).toBe("Author-owned material\n");
  expect(await readFile(join(app, "agent.ts"), "utf8")).toContain("createKyoshiAgent");
  expect(await readFile(join(app, "tools/dojo_ui_ask.ts"), "utf8")).toContain("@dojofoo/authoring/eve/ask");
  expect(await readFile(join(app, "tools/dojo_authoring_evaluate.ts"), "utf8")).toContain("createKyoshiEvaluationTool");
  for (const [skill, files] of Object.entries(kyoshiSkills)) {
    for (const file of files) {
      expect(await readFile(join(app, "skills", skill, file), "utf8")).toBe(readPrompt(`skills/${skill}/${file}`));
    }
  }
  // Native filesystem operations must not also be registered as host tools.
  for (const name of ["bash", "read_file", "write_file"]) {
    expect(await readFile(join(app, `tools/${name}.ts`), "utf8")).toContain("disableTool()");
  }
  const bashModule = pathToFileURL(join(app, "tools/bash.ts")).href;
  expect(execFileSync(process.execPath, ["--input-type=module", "-e",
    `const { default: tool } = await import(${JSON.stringify(bashModule)}); process.stdout.write(tool.kind);`,
  ], { encoding: "utf8" })).toBe("eve:disabled-tool");
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
