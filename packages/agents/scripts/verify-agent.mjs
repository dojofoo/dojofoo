import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

// No prompt or model call, apart from Eve's mock model for Sensei's ended session. Observe child processes as well as SDK readiness.
const commands = [];
const spawn = childProcess.spawn;
childProcess.spawn = function (command, args, options) {
  commands.push([command, ...(Array.isArray(args) ? args : [])]);
  return spawn.call(this, command, args, options);
};
syncBuiltinESMExports();
const load = createRequire(new URL("../package.json", import.meta.url));
const { Client } = await import(load.resolve("@dojofoo/harness/client"));
const { startProductionServer } = await import(load.resolve("@dojofoo/harness/server/production"));
const { createKyoshiRuntime } = await import("../dist/eve/runtime.js");
const { createSenseiRuntime } = await import("../dist/sensei/runtime.js");
const cli = JSON.parse(await readFile(new URL("../../cli/package.json", import.meta.url), "utf8"));
const sdk = JSON.parse(await readFile(load.resolve("@dojofoo/harness/package.json"), "utf8"));
const eve = JSON.parse(await readFile(load.resolve("@dojofoo/harness/eve/package.json"), "utf8"));
const personas = {
  kyoshi: { create: createKyoshiRuntime, app: ".dojo/kyoshi-app/agents/kyoshi", relocate: copy => ({ courseRoot: copy }) },
  sensei: { create: createSenseiRuntime, app: ".dojo/sensei-app/agents/sensei", relocate: copy => ({ workspaceRoot: copy }) },
};
const kataTools = ["dojo_learner_observe", "dojo_lesson_verify", "dojo_ui_show"];
const { startHostPortFixture } = await import(load.resolve("@dojofoo/harness/host-port/fixture"));
const labels = {};
for (const persona of Object.keys(personas)) {
  const prepared = new URL(`../dist/prepared/${persona}/`, import.meta.url);
  const label = JSON.parse(await readFile(new URL("build.json", prepared), "utf8"));
  assert.equal(label.dojofoo, `dojofoo@${cli.version}`);
  assert.equal(label.source, `dojofoo/${persona}@${cli.version}`);
  assert.equal(label.harness, `@dojofoo/harness@${sdk.version}`);
  assert.equal(label.eve, `eve@${eve.version}`);
  assert.equal(label.sourceHash, await readFile(new URL("source.sha256", prepared), "utf8"));
  labels[persona] = label;
}
const root = await mkdtemp(join(tmpdir(), "dojo-prebuilt-startup-"));
// Process records and Sensei's scratch directory stay out of the developer's own state
process.env.DOJOFOO_HOME = join(root, ".dojofoo-home");
const copies = [];
const results = {};
try {
  const override = join(root, ".dojo/kyoshi");
  await mkdir(override, { recursive: true });
  await writeFile(join(override, "agent.ts"), 'throw new Error("Course Kyoshi overrides must not load");\n');
  const legacy = join(root, ".dojo/kyoshi-app/agents/kyoshi");
  await mkdir(join(legacy, ".eve/dev-runtime"), { recursive: true });
  await writeFile(join(legacy, "runtime.json"), JSON.stringify({ harness: "opencode" }));
  for (const [persona, { create, app: appPath, relocate }] of Object.entries(personas)) {
    const timings = [];
    let sessionId, saved;
    for (const label of ["cold open", "cold resume"]) {
      const began = performance.now();
      const runtime = await create(root);
      try {
        const ready = await runtime.start();
        const infoAt = performance.now();
        const client = new Client({ baseUrl: ready.url, auth: ready.auth });
        if (label === "cold open") {
          const info = await client.info({ signal: AbortSignal.timeout(10_000) });
          assert.ok(info.hooks.some(hook => hook.slug === "dojofoo-lifecycle"), `${persona} lacks dojofoo's lifecycle hook`);
          // Only Sensei's own tools: no bash, file, web or subagent tools
          if (persona === "sensei") {
            assert.deepEqual(info.tools.static.map(tool => tool.name).sort(), ["ask_question", "dojo_context", "dojo_lesson_complete"]);
            // Info lists a dynamic tool only by its slug; which a session gets is read from a turn below
            const dynamic = info.tools.dynamic.map(tool => tool.slug);
            for (const slug of kataTools) assert.ok(dynamic.includes(slug), `Sensei's info lacks the dynamic tool ${slug}`);
          }
        }
        const session = sessionId ? client.sessions.attach(sessionId) : (await client.sessions.create({ signal: AbortSignal.timeout(10_000) })).session;
        sessionId ??= session.state.sessionId;
        assert.equal(session.state.sessionId, sessionId);
        // The history and its cursor; the session's opaque inbox hint isn't part of it
        const { events, session: { sessionId: id, streamIndex } } = await session.snapshot({ signal: AbortSignal.timeout(10_000) });
        const snapshot = { events, sessionId: id, streamIndex };
        if (saved) assert.deepEqual(snapshot, saved);
        else saved = snapshot;
        timings.push({ operation: label, readyMs: Math.round(infoAt - began), attachedMs: Math.round(performance.now() - began) });
        if (label === "cold resume") {
          const warmAt = performance.now();
          const warm = await client.sessions.attach(sessionId).snapshot({ signal: AbortSignal.timeout(10_000) });
          assert.deepEqual({ events: warm.events, sessionId: warm.session.sessionId, streamIndex: warm.session.streamIndex }, saved);
          timings.push({ operation: "warm resume", readyMs: 0, attachedMs: Math.round(performance.now() - warmAt) });
        }
      } finally { await runtime.close(); }
    }
    const endedSessionReadable = persona === "sensei" ? await endedReadable(create, root) : undefined;
    const kataToolsOffered = persona === "sensei" ? { katas: await offeredKataTools(root, "katas"), interactive: await offeredKataTools(root, "interactive") } : undefined;
    if (kataToolsOffered) {
      assert.deepEqual(kataToolsOffered.katas, [...kataTools].sort(), "A kata session is not offered its tools");
      assert.deepEqual(kataToolsOffered.interactive, [], "An interactive session is offered kata tools");
    }
    const app = join(root, appPath);
    const copy = await mkdtemp(join(tmpdir(), `dojo-prebuilt-relocated-${persona}-`));
    copies.push(copy);
    await cp(await realpath(join(app, ".output")), join(copy, ".output"), { recursive: true, verbatimSymlinks: true });
    assert.deepEqual(JSON.parse(await readFile(join(copy, ".output/build.json"), "utf8")), labels[persona]);
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
    await writeFile(join(copy, "runtime.json"), JSON.stringify({ ...binding, ...relocate(copy) }), { mode: 0o600 });
    const relocated = await startProductionServer(copy, { host: "127.0.0.1", port: 0 });
    try {
      const info = await new Client({ baseUrl: relocated.url, auth: { basic: binding.auth } }).info({ signal: AbortSignal.timeout(10_000) });
      assert.ok(info);
    } finally { await relocated.close(); }
    results[persona] = { build: labels[persona], timings, sameSession: true, copiedArtifactReady: true, ...(endedSessionReadable ? { endedSessionReadable } : {}),
      ...(kataToolsOffered ? { kataToolsOffered } : {}) };
  }
  const builds = commands.filter(args => args.some(arg => /(?:^|\/)(?:vite|rolldown|tsup|tsc|nft)(?:\.|$)|^build$|dev-server/u.test(String(arg))));
  assert.deepEqual(builds, [], "Opening or resuming spawned a compiler");
  assert.equal(await readFile(join(override, "agent.ts"), "utf8"), 'throw new Error("Course Kyoshi overrides must not load");\n');
  const { build, timings, sameSession, copiedArtifactReady } = results.kyoshi;
  console.log(JSON.stringify({ build, timings, sameSession, copiedArtifactReady, courseKyoshiIgnored: true, legacyBindingUsesProduction: true,
    buildProcesses: builds.length, personas: results }, null, 2));
} finally {
  childProcess.spawn = spawn;
  syncBuiltinESMExports();
  await Promise.all([root, ...copies].map(path => rm(path, { recursive: true, force: true })));
}

/** Open risk 11 for Sensei: an ended session is readable after a host restart (retention "default"). A bodyless session cannot
 *  end, so it starts with one turn on Eve's mock model; session.ended closes the stream before the end's delivery settles. */
async function endedReadable(create, workspace) {
  const mock = process.env.EVE_MOCK_AUTHORED_MODELS;
  process.env.EVE_MOCK_AUTHORED_MODELS = "1";
  let sessionId;
  try {
    const first = await create(workspace);
    try {
      const ready = await first.start();
      const { session, delivery } = await new Client({ baseUrl: ready.url, auth: ready.auth }).sessions.create({ message: "Hello.", signal: AbortSignal.timeout(20_000) });
      sessionId = session.id;
      await delivery.result({ signal: AbortSignal.timeout(30_000) });
      await session.end({ signal: AbortSignal.timeout(20_000) });
      for (const deadline = Date.now() + 20_000; Date.now() < deadline; await new Promise(resolve => setTimeout(resolve, 100))) {
        if ((await session.snapshot({ signal: AbortSignal.timeout(5_000) })).events.some(event => event.type === "session.ended")) break;
      }
    } finally { await first.close(); }
  } finally {
    if (mock === undefined) delete process.env.EVE_MOCK_AUTHORED_MODELS;
    else process.env.EVE_MOCK_AUTHORED_MODELS = mock;
  }
  const second = await create(workspace);
  try {
    const ready = await second.start();
    const snapshot = await new Client({ baseUrl: ready.url, auth: ready.auth }).sessions.attach(sessionId).snapshot({ signal: AbortSignal.timeout(20_000) });
    assert.ok(snapshot.events.some(event => event.type === "session.ended"), "An ended Sensei session is not readable after a restart");
    return true;
  } finally { await second.close(); }
}

/** The kata tools one session is offered: /eve/v1/info names dynamic tools only by slug (step-5 plan, fact 15), and model.requested
 *  carries no tool names (step-5 plan, commit 7's fallback), so Eve's mock model is asked to call all three in parallel. */
async function offeredKataTools(workspace, mode) {
  const kata = mode === "katas";
  const port = await startHostPortFixture({ handlers: {
    session: () => ({ courseId: "fixture", ...(kata ? { lessonId: "first" } : {}), mode, revision: 0 }),
    context: () => kata
      ? { kind: "kata", hash: "fixture", course: { id: "fixture", title: "Fixture" }, guidance: "", lesson: { id: "first", source: "# First\n", fragmentIds: [] },
        context: { phase: "start", course: { id: "fixture", completedLessons: [] }, lesson: { id: "first", title: "First", objective: "Fixture", state: "ongoing" },
          learner: { file: { path: "first.ts", language: "typescript", content: "export const answer = 0;\n" }, latestCheck: null } } }
      : { kind: "interactive", hash: "fixture", course: { id: "fixture", title: "Fixture" }, guidance: "", lesson: { title: "Lesson" } },
    check: () => ({ observationId: "fixture", report: { passed: 0, failed: 0, skipped: 0, total: 0, complete: false, tests: [] } }),
    show: input => ({ fragmentId: input?.fragmentId ?? "" }),
  } });
  const mock = process.env.EVE_MOCK_AUTHORED_MODELS;
  process.env.EVE_MOCK_AUTHORED_MODELS = "1";
  const runtime = await createSenseiRuntime(workspace, { workspaceId: `kata-tools-${mode}`, hostPortUrl: port.url });
  try {
    const ready = await runtime.start();
    const { session, delivery } = await new Client({ baseUrl: ready.url, auth: ready.auth }).sessions.create({
      message: `call tools in parallel: ${kataTools.join(", ")}`, signal: AbortSignal.timeout(20_000) });
    await delivery.result({ signal: AbortSignal.timeout(60_000) });
    const { events } = await session.snapshot({ signal: AbortSignal.timeout(10_000) });
    const called = [...new Set(events.filter(event => event.type === "call.requested").map(event => event.data.capability?.name)
      .filter(name => kataTools.includes(name)))].sort();
    // The mock's parallel directive calls nothing unless every named tool is offered; it drops a call whose input it can't
    // synthesise (dojo_learner_observe's cited sha256), so any call means all three were offered
    return called.length ? [...kataTools].sort() : [];
  } finally {
    await runtime.close();
    await port.close();
    if (mock === undefined) delete process.env.EVE_MOCK_AUTHORED_MODELS;
    else process.env.EVE_MOCK_AUTHORED_MODELS = mock;
  }
}
