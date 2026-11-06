import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, delimiter } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { prepareHarnessEnvironment } from "../../dist/runtime-toolchain.js";

const execute = promisify(execFile);
async function directory(t) {
  const root = await mkdtemp(join(tmpdir(), "dojo-runtime-tools-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("mise prepares pinned bootstrap tools without loading course config or replacing credentials", async t => {
  const root = await directory(t);
  const bin = join(root, ".local/bin");
  await mkdir(bin, { recursive: true });
  const log = join(root, "commands.jsonl");
  await writeFile(join(bin, "mise"), `#!${process.execPath}
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.argv.includes('env')) console.log(JSON.stringify({PATH:'/managed/pnpm:/bin', TOKEN:'must-not-replace'}));
`, { mode: 0o755 });
  const original = { HOME: root, PATH: "/incompatible/pnpm:/bin", TOKEN: "original" };
  const result = await prepareHarnessEnvironment(original);
  assert.deepEqual(result, { ...original, PATH: "/managed/pnpm:/bin" });
  assert.equal(original.PATH, "/incompatible/pnpm:/bin");
  assert.deepEqual((await readFile(log, "utf8")).trim().split("\n").map(JSON.parse), [
    ["--no-config", "install", "pnpm@10.34.5", "--yes"],
    ["--no-config", "env", "pnpm@10.34.5", "--json"],
  ]);
});

test("missing mise fails explicitly rather than falling back to global pnpm", async t => {
  const root = await directory(t);
  await assert.rejects(prepareHarnessEnvironment({ HOME: root, PATH: root }), /npx dojofoo install/);
});

test("real mise runs the official workspace shape with missing or incompatible global pnpm", {
  skip: process.env.DOJO_MISE_BOOTSTRAP !== "1",
}, async t => {
  const root = await directory(t);
  const bin = join(root, "bin");
  await mkdir(bin);
  await writeFile(join(bin, "pnpm"), "#!/bin/sh\necho WRONG_GLOBAL_PNPM >&2\nexit 42\n", { mode: 0o755 });
  await writeFile(join(root, "package.json"), '{"private":true}');
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n");
  // Official OpenCode adapter emits this form; pnpm 10.28 rejects it.
  await writeFile(join(root, "pnpm-workspace.yaml"), "allowBuilds:\n  'opencode-ai@1.18.23': true\n");
  await writeFile(join(root, "mise.toml"), '[tools]\npnpm = "0.0.0"\n');
  for (const prefix of [bin, ""]) {
    const input = { ...process.env, PATH: [prefix, dirname(process.execPath), "/usr/bin", "/bin"].filter(Boolean).join(delimiter) };
    const env = await prepareHarnessEnvironment(input);
    const version = await execute("pnpm", ["--version"], { cwd: root, env });
    assert.equal(version.stdout.trim(), "10.34.5");
    await execute("pnpm", ["install", "--frozen-lockfile", "--offline", "--ignore-scripts", "--store-dir", ".pnpm-store"], { cwd: root, env });
  }
  assert.equal(await readFile(join(root, "mise.toml"), "utf8"), '[tools]\npnpm = "0.0.0"\n');
});
