import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCourseKyoshi } from "../dist/eve/build.js";
import { createKyoshiRuntime } from "../dist/eve/runtime.js";

const load = createRequire(new URL("../package.json", import.meta.url));
const { Client } = await import(load.resolve("@dojofoo/agent/client"));
const root = await mkdtemp(join(tmpdir(), "dojo-custom-agent-"));
const source = join(root, ".dojo/kyoshi");
const relocated = await mkdtemp(join(tmpdir(), "dojo-custom-agent-relocated-"));
const startupCommands = [];
let tracking = false;
const spawn = childProcess.spawn;
childProcess.spawn = function (command, args, options) {
  if (tracking) startupCommands.push([command, ...(Array.isArray(args) ? args : [])]);
  return spawn.call(this, command, args, options);
};
syncBuiltinESMExports();
await mkdir(join(source, "tools"), { recursive: true });
await writeFile(join(source, "instructions.md"), "Teach this course through questions.\n");
await writeFile(join(source, "tools/course_question.ts"), 'export { default } from "@dojofoo/agent/tools/ask_question";\n');
let sessionId, snapshot, output;
const timings = [];
try {
  await buildCourseKyoshi(root);
  tracking = true;
  for (const label of ["open", "resume"]) {
    const began = performance.now();
    const runtime = await createKyoshiRuntime(root);
    try {
      const ready = await runtime.start();
      const client = new Client({ host: ready.url, auth: ready.auth });
      assert.ok(JSON.stringify(await client.info()).includes("course_question"));
      const session = sessionId ? client.sessions.attach(sessionId) : (await client.sessions.create()).session;
      sessionId ??= session.state.sessionId;
      const saved = await session.snapshot();
      if (snapshot) assert.deepEqual(saved, snapshot);
      else snapshot = saved;
      assert.equal(session.state.sessionId, sessionId);
      timings.push({ operation: label, milliseconds: Math.round(performance.now() - began) });
      output ??= join(root, ".dojo/kyoshi-host/agents/kyoshi/.output");
    } finally { await runtime.close(); }
  }
  const before = await stat(join(output, "server/index.mjs"));
  tracking = false;
  await buildCourseKyoshi(root);
  assert.equal((await stat(join(output, "server/index.mjs"))).mtimeMs, before.mtimeMs);
  const binding = JSON.parse(await readFile(join(root, ".dojo/kyoshi-host/agents/kyoshi/runtime.json"), "utf8"));
  assert.equal(binding.courseRoot, root);
  await cp(source, join(relocated, ".dojo/kyoshi"), { recursive: true,
    filter: path => ![".eve", ".output", "runtime.json"].includes(path.split(/[\\/]/u).at(-1)),
  });
  await cp(join(root, ".dojo/kyoshi-builds"), join(relocated, ".dojo/kyoshi-builds"), { recursive: true, verbatimSymlinks: true });
  await rm(root, { recursive: true, force: true });
  tracking = true;
  const moved = await createKyoshiRuntime(relocated);
  try {
    const ready = await moved.start();
    assert.ok(JSON.stringify(await new Client({ host: ready.url, auth: ready.auth }).info()).includes("course_question"));
  } finally { await moved.close(); }
  const builds = startupCommands.filter(args => args.some(arg => /(?:^|\/)(?:vite|rolldown|tsup|tsc|nft)(?:\.|$)|^build$|dev-server/u.test(String(arg))));
  assert.deepEqual(builds, [], "Custom-agent startup spawned a compiler");
  console.log(JSON.stringify({ timings, sameSession: true, customToolReady: true, unchangedSourceUsesCache: true, relocatedArtifactReady: true, buildProcessesOnStartup: builds.length }, null, 2));
} finally {
  childProcess.spawn = spawn;
  syncBuiltinESMExports();
  await Promise.all([rm(root, { recursive: true, force: true }), rm(relocated, { recursive: true, force: true })]);
}
