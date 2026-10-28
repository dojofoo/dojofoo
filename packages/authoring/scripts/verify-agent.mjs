import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

// No prompt or model call. Observe child processes as well as SDK readiness.
const commands = [];
const spawn = childProcess.spawn;
childProcess.spawn = function (command, args, options) {
  commands.push([command, ...(Array.isArray(args) ? args : [])]);
  return spawn.call(this, command, args, options);
};
syncBuiltinESMExports();
const load = createRequire(new URL("../package.json", import.meta.url));
const { Client } = await import(load.resolve("@dojofoo/agent/client"));
const { startProductionServer } = await import(load.resolve("@dojofoo/agent/server/production"));
const { createKyoshiRuntime } = await import("../dist/eve/runtime.js");
const prepared = new URL("../dist/prepared/kyoshi/", import.meta.url);
const label = JSON.parse(await readFile(new URL("build.json", prepared), "utf8"));
const cli = JSON.parse(await readFile(new URL("../../cli/package.json", import.meta.url), "utf8"));
const sdk = JSON.parse(await readFile(load.resolve("@dojofoo/agent/package.json"), "utf8"));
const eve = JSON.parse(await readFile(load.resolve("@dojofoo/agent/eve/package.json"), "utf8"));
assert.equal(label.dojofoo, `dojofoo@${cli.version}`);
assert.equal(label.source, `dojofoo/kyoshi@${cli.version}`);
assert.equal(label.agent, `@dojofoo/agent@${sdk.version}`);
assert.equal(label.eve, `eve@${eve.version}`);
assert.equal(label.sourceHash, await readFile(new URL("source.sha256", prepared), "utf8"));
const root = await mkdtemp(join(tmpdir(), "dojo-prebuilt-startup-"));
const copy = await mkdtemp(join(tmpdir(), "dojo-prebuilt-relocated-"));
const timings = [];
let sessionId, saved;
try {
  const override = join(root, ".dojo/kyoshi");
  await mkdir(override, { recursive: true });
  await writeFile(join(override, "agent.ts"), 'throw new Error("Course Kyoshi overrides must not load");\n');
  const legacy = join(root, ".dojo/kyoshi-app/agents/kyoshi");
  await mkdir(join(legacy, ".eve/dev-runtime"), { recursive: true });
  await writeFile(join(legacy, "runtime.json"), JSON.stringify({ harness: "opencode" }));
  for (const label of ["cold open", "cold resume"]) {
    const began = performance.now();
    const runtime = await createKyoshiRuntime(root);
    try {
      const ready = await runtime.start();
      const infoAt = performance.now();
      const client = new Client({ host: ready.url, auth: ready.auth });
      const session = sessionId ? client.sessions.attach(sessionId) : (await client.sessions.create({ signal: AbortSignal.timeout(10_000) })).session;
      sessionId ??= session.state.sessionId;
      assert.equal(session.state.sessionId, sessionId);
      const snapshot = await session.snapshot({ signal: AbortSignal.timeout(10_000) });
      if (saved) assert.deepEqual(snapshot, saved);
      else saved = snapshot;
      timings.push({ operation: label, readyMs: Math.round(infoAt - began), attachedMs: Math.round(performance.now() - began) });
      if (label === "cold resume") {
        const warmAt = performance.now();
        assert.deepEqual(await client.sessions.attach(sessionId).snapshot({ signal: AbortSignal.timeout(10_000) }), saved);
        timings.push({ operation: "warm resume", readyMs: 0, attachedMs: Math.round(performance.now() - warmAt) });
      }
    } finally { await runtime.close(); }
  }
  const app = join(root, ".dojo/kyoshi-app/agents/kyoshi");
  await cp(await realpath(join(app, ".output")), join(copy, ".output"), { recursive: true, verbatimSymlinks: true });
  assert.deepEqual(JSON.parse(await readFile(join(copy, ".output/build.json"), "utf8")), label);
  async function verifyLinks(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await realpath(path);
        assert.ok(!relative(await realpath(copy), target).startsWith(".."), `Prepared dependency escapes the copied artifact: ${path}`);
      } else if (entry.isDirectory()) await verifyLinks(path);
    }
  }
  await verifyLinks(join(copy, ".output"));
  const binding = JSON.parse(await readFile(join(app, "runtime.json"), "utf8"));
  await writeFile(join(copy, "runtime.json"), JSON.stringify({ ...binding, courseRoot: copy }), { mode: 0o600 });
  const relocated = await startProductionServer(copy, { host: "127.0.0.1", port: 0 });
  try {
    const info = await new Client({ host: relocated.url, auth: { basic: binding.auth } }).info({ signal: AbortSignal.timeout(10_000) });
    assert.ok(info);
  } finally { await relocated.close(); }
  const builds = commands.filter(args => args.some(arg => /(?:^|\/)(?:vite|rolldown|tsup|tsc|nft)(?:\.|$)|^build$|dev-server/u.test(String(arg))));
  assert.deepEqual(builds, [], "Opening or resuming spawned a compiler");
  assert.equal(await readFile(join(override, "agent.ts"), "utf8"), 'throw new Error("Course Kyoshi overrides must not load");\n');
  console.log(JSON.stringify({ build: label, timings, sameSession: true, copiedArtifactReady: true, courseKyoshiIgnored: true, legacyBindingUsesProduction: true, buildProcesses: builds.length }, null, 2));
} finally {
  childProcess.spawn = spawn;
  syncBuiltinESMExports();
  await Promise.all([rm(root, { recursive: true, force: true }), rm(copy, { recursive: true, force: true })]);
}
