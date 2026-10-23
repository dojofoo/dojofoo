import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { Client } from "@dojofoo/agent/client";
import { createDevelopmentServer } from "@dojofoo/agent/server";

const eveRoot = new URL("./", import.meta.resolve("@dojofoo/agent/eve/package.json"));
const { compileAgent } = await import(new URL("dist/src/compiler/compile-agent.js", eveRoot));

async function sharedHome(t) {
  const home = await mkdtemp(join(tmpdir(), "dojo-manifest-free-shared-"));
  const previous = process.env.DOJOFOO_HOME;
  process.env.DOJOFOO_HOME = home;
  t.after(async () => {
    if (previous === undefined) delete process.env.DOJOFOO_HOME;
    else process.env.DOJOFOO_HOME = previous;
    await rm(home, { recursive: true, force: true });
  });
  return home;
}

async function assertSourceOnly(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assert.equal((await lstat(path)).isSymbolicLink(), false, path);
    assert.notEqual(entry.name, "package.json", path);
    assert.notEqual(entry.name, "node_modules", path);
    if (entry.isDirectory()) await assertSourceOnly(path);
  }
}

test("manifest-free Kyoshi and Sensei compile against the installed runtime without project dependencies", async t => {
  const home = await sharedHome(t);
  // Outside the repository: no accidental ancestor node_modules/package.json.
  const project = await mkdtemp(join(tmpdir(), "dojo-manifest-free-"));
  try {
    for (const role of ["kyoshi", "sensei"]) {
      const root = join(project, ".dojo", role);
      await mkdir(root, { recursive: true });
      await writeFile(join(root, "instructions.md"), `You are ${role}. Read only your assigned workspace.\n`);
      await writeFile(join(root, role === "kyoshi" ? "agent.ts" : "agent.js"), [
        'import { defineAgent } from "@dojofoo/agent";',
        'export default defineAgent({ model: "openai/gpt-4o" });',
        "",
      ].join("\n"));
      await assertSourceOnly(project);
      const compiled = await compileAgent({ startPath: root });
      assert.equal(compiled.metadata.status, "ready");
      assert.equal(compiled.project.appRoot, root);
      assert.equal(compiled.project.agentRoot, root);
      assert.ok(compiled.manifest.instructions.some(item => item.content.includes(`You are ${role}.`)));
      await assertSourceOnly(project);
    }
    assert.ok((await readdir(join(home, "cache/authored-modules"))).some(name => name.endsWith(".mjs")));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("manifest-free roles use real Eve tools, isolated course/trial files and durable histories", { timeout: 180_000 }, async t => {
  await sharedHome(t);
  const project = await mkdtemp(join(tmpdir(), "dojo-manifest-free-host-"));
  const trial = await mkdtemp(join(tmpdir(), "dojo-manifest-free-trial-"));
  let server;
  try {
    await writeFile(join(project, "note.md"), "Author's original course.\n");
    await writeFile(join(project, "DOJO.md"), "DOJO_GUIDANCE: Let the learner choose the edit.\n");
    const lesson = join(project, "src/001-double");
    await mkdir(lesson, { recursive: true });
    await writeFile(join(lesson, "SENSEI.md"), "SENSEI_GUIDANCE: Teach doubling without writing the answer.\n");
    const stub = "export const double = value => { throw Error('Not implemented'); };\n";
    await writeFile(join(lesson, "kata.mjs"), stub);
    const checks = "import assert from 'node:assert/strict'; import { test } from 'node:test'; import { double } from './kata.mjs'; test('double', () => assert.equal(double(3), 6));\n";
    await writeFile(join(lesson, "kata.test.mjs"), checks);
    const sessions = [];
    for (const [role, workspace] of [["kyoshi", project], ["sensei", trial]]) {
      if (role === "sensei") {
        for (const name of ["note.md", "DOJO.md"]) await copyFile(join(project, name), join(trial, name));
        for (const name of ["kata.mjs", "kata.test.mjs", "SENSEI.md"]) await copyFile(join(lesson, name), join(trial, name));
      }
      const root = join(workspace, ".dojo", role);
      await mkdir(join(root, "sandbox"), { recursive: true });
      await mkdir(join(root, "tools"), { recursive: true });
      await copyFile(new URL("host-agent.fixture.ts", import.meta.url), join(root, "agent.ts"));
      const guidance = role === "kyoshi" ? join(project, "DOJO.md") : join(trial, "SENSEI.md");
      await writeFile(join(root, "instructions.ts"), `
import { readFile } from "node:fs/promises";
import { defineInstructions } from "@dojofoo/agent/instructions";
export default defineInstructions({ content: "HOST_INSTRUCTIONS_LOADED: You are ${role}.\\n" + await readFile(${JSON.stringify(guidance)}, "utf8")${role === "sensei" ? ` + await readFile(${JSON.stringify(join(trial, "DOJO.md"))}, "utf8")` : ""} });
`);
      for (const tool of ["read_file", "write_file", "ask_question"]) {
        await writeFile(join(root, "tools", `${tool}.ts`), `export { default } from "@dojofoo/agent/tools/${tool}";\n`);
      }
      await writeFile(join(root, "tools/root_only.ts"), 'export { default } from "@dojofoo/agent/tools/read_file";\n');
      await writeFile(join(root, "sandbox/sandbox.ts"), `
import { defineSandbox } from "@dojofoo/agent/sandbox";
import { JustBashSandbox } from "@dojofoo/agent/sandbox/just-bash";
export const environment = JustBashSandbox.environment({
  autoInstall: false,
  filesystem: ({ defaultFilesystem, justBash }) => new justBash.MountableFs({
    base: defaultFilesystem,
    mounts: [{ mountPoint: "/course", filesystem: new justBash.ReadWriteFs({ root: ${JSON.stringify(workspace)} }) }],
  }),
});
export default defineSandbox(() => environment.open());
`);
      const compiled = await compileAgent({ startPath: root });
      assert.ok(compiled.manifest.instructions.some(item => item.content.includes(role === "kyoshi" ? "DOJO_GUIDANCE" : "SENSEI_GUIDANCE")));
      if (role === "sensei") assert.ok(compiled.manifest.instructions.some(item => item.content.includes("DOJO_GUIDANCE")));
      server = createDevelopmentServer(root, { host: "127.0.0.1", port: 0, existing: "reject", resume: true });
      const { url } = await server.start();
      const client = new Client({ host: url });
      const created = await client.sessions.create({ message: "Read authoring note", signal: AbortSignal.timeout(30_000) });
      const first = JSON.parse((await created.response.result()).message);
      assert.match(JSON.stringify(first.history), role === "kyoshi" ? /Author's original course/ : /Edited by Kyoshi/);
      assert.deepEqual(first.history.filter(item => typeof item === "string"), ["Read authoring note"]);
      sessions.push(first.sessionId);
      if (role === "sensei") await writeFile(join(trial, "note.md"), "Learner's isolated attempt.\n");
      else await (await created.session.send("Write authoring note", { signal: AbortSignal.timeout(30_000) })).result();
      assert.equal(await readFile(join(project, "note.md"), "utf8"), "Edited by Kyoshi.\n");
      const waiting = await (await created.session.send("Ask before continuing", { signal: AbortSignal.timeout(30_000) })).result();
      assert.equal(waiting.inputRequests.length, 1);
      const saved = { sessionId: created.session.state.sessionId, streamIndex: created.session.state.streamIndex };
      await server.close();
      server = createDevelopmentServer(root, { host: "127.0.0.1", port: 0, existing: "reject", resume: true });
      const restarted = await server.start();
      const restored = new Client({ host: restarted.url }).sessions.attach(saved.sessionId, { streamIndex: saved.streamIndex });
      const answer = await (await restored.respond([{ requestId: waiting.inputRequests[0].requestId, optionId: "Review" }], { signal: AbortSignal.timeout(30_000) })).result();
      const resumed = JSON.parse(answer.message);
      assert.equal(resumed.sessionId, first.sessionId);
      assert.equal(resumed.history.filter(item => item?.answer).length, 1);
      await server.close();
      server = undefined;
      await assertSourceOnly(project);
      await assertSourceOnly(trial);
    }
    assert.notEqual(sessions[0], sessions[1]);
    assert.equal(await readFile(join(trial, "note.md"), "utf8"), "Learner's isolated attempt.\n");
    assert.equal(await readFile(join(project, "note.md"), "utf8"), "Edited by Kyoshi.\n");
    const check = () => promisify(execFile)(process.execPath, ["--test", "kata.test.mjs"], {
      cwd: trial, timeout: 10_000,
      env: { ...process.env, NODE_TEST_CONTEXT: undefined },
    });
    await assert.rejects(check(), error => error.code === 1 && error.stdout.includes("Not implemented"));
    // This edit is the simulated learner's action, not a Sensei tool call.
    await writeFile(join(trial, "kata.mjs"), "export const double = value => value * 2;\n");
    const passed = await check();
    assert.match(passed.stdout, /pass 1/);
    assert.equal(await readFile(join(lesson, "kata.mjs"), "utf8"), stub);
    await assertSourceOnly(project);
    await assertSourceOnly(trial);
  } finally {
    await server?.close();
    await rm(project, { recursive: true, force: true });
    await rm(trial, { recursive: true, force: true });
  }
});
