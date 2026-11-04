import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { Client, SessionStore } from "@dojofoo/agent/client";
import { createAuthoringSandbox } from "@dojofoo/authoring/sandbox";

import { createDevelopmentServer } from "@dojofoo/agent/server";

// The fixture sandboxes are just-bash. Do not wait on an installed Docker CLI
// whose daemon is down when the development server closes.
process.env.EVE_DOCKER_PATH ??= join(process.cwd(), "no-docker");

function projectedJson(store) {
  const { messages, events } = store.snapshot;
  const projectedReply = messages.filter(message => message.role === "assistant").at(-1)?.parts
    .filter(part => part.type === "text").map(part => part.text).join("");
  try { return JSON.parse(projectedReply); }
  catch (cause) {
    throw new Error(JSON.stringify({ projectedReply, messages, events }), { cause });
  }
}

// A delivery settles on the server before the store has necessarily read its
// last commit; wait for the store's own view to come to rest.
function idle(store) {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (store.snapshot.error) { unsubscribe(); reject(store.snapshot.error); }
      else if (store.snapshot.status === "idle") { unsubscribe(); resolve(store.snapshot); }
    };
    const unsubscribe = store.subscribe(check);
    check();
  });
}

async function sendAndSettle(store, payload) {
  const result = await (await store.send(payload)).result({ signal: AbortSignal.timeout(60_000) });
  await idle(store);
  return result;
}

const reply = result => JSON.parse(result.reply);
const toolParts = (store, name) => store.snapshot.messages.flatMap(message => message.parts)
  .filter(part => part.type === "tool" && part.name === name);

test("authoring rejects ambiguous or filesystem-root mounts", () => {
  for (const path of [".", "relative/course", "/", "/tmp/.."])
    assert.throws(() => createAuthoringSandbox(path), /absolute course directory/);
});

for (const specialist of [false, true]) test(`Eve's HTTP workflow host isolates conversations, recovers, and delegates (specialist=${specialist})`, { timeout: 180_000 }, async () => {
  const root = await mkdtemp(join(process.cwd(), "hosted-provider-"));
  // 1.0 resolves the agent directory inside its package.
  const agent = join(root, "agent");
  // Match production: editable course material lives outside the Eve app,
  // so saving it must not race a rebuild of the authored agent itself.
  const course = await mkdtemp(join(process.cwd(), "hosted-course-"));
  let server;
  let observedSession;
  let stage = "prepare host";
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "hosted-provider-fixture", private: true, type: "module" }));
    await mkdir(join(agent, "tools"), { recursive: true });
    await copyFile(new URL("host-agent.fixture.ts", import.meta.url), join(agent, "agent.ts"));
    await writeFile(join(agent, "instructions.md"), "HOST_INSTRUCTIONS_LOADED: Teach one concept at a time.\n");
    await writeFile(join(agent, "tools/ask_question.ts"), 'export { default } from "@dojofoo/agent/tools/ask_question";\n');
    await writeFile(join(agent, "tools/read_file.ts"), 'export { default } from "@dojofoo/agent/tools/read_file";\n');
    await writeFile(join(agent, "tools/root_only.ts"), 'import { defineTool } from "@dojofoo/agent/tools"; import read from "@dojofoo/agent/tools/read_file"; export default defineTool({ ...read, description: "Root-only lesson evidence lookup." });\n');
    await writeFile(join(agent, "tools/write_file.ts"), 'export { default } from "@dojofoo/agent/tools/write_file";\n');
    await mkdir(join(agent, "sandbox/workspace"), { recursive: true });
    await writeFile(join(course, "note.md"), "Authored in the editor.\n");
    await writeFile(join(agent, "sandbox/sandbox.ts"), `import { defineSandbox } from "@dojofoo/agent/sandbox"; import { createAuthoringSandbox } from "@dojofoo/authoring/sandbox"; export const environment = createAuthoringSandbox(${JSON.stringify(course)}); export default defineSandbox(() => environment.open());\n`);
    await writeFile(join(agent, "sandbox/workspace/note.md"), "Original lesson note.\n");
    if (specialist) {
      await mkdir(join(agent, "subagents/reviewer/tools"), { recursive: true });
      await mkdir(join(agent, "subagents/reviewer/sandbox/workspace"), { recursive: true });
      await writeFile(join(agent, "subagents/reviewer/agent.ts"), 'import { defineAgent } from "@dojofoo/agent"; import root from "../../agent"; export default defineAgent({ ...root, description: "Review lesson evidence independently." });\n');
      await writeFile(join(agent, "subagents/reviewer/instructions.md"), "SPECIALIST_INSTRUCTIONS_LOADED: Read your own lesson evidence before reviewing.\n");
      await copyFile(join(agent, "tools/read_file.ts"), join(agent, "subagents/reviewer/tools/read_file.ts"));
      await writeFile(join(agent, "subagents/reviewer/sandbox/sandbox.ts"), 'import { defineSandbox } from "@dojofoo/agent/sandbox"; import { JustBashSandbox } from "@dojofoo/agent/sandbox/just-bash"; export const environment = JustBashSandbox.environment({ autoInstall: false }); export default defineSandbox(() => environment.open());\n');
      await writeFile(join(agent, "subagents/reviewer/sandbox/workspace/note.md"), "Specialist-only evidence.\n");
    }
    server = createDevelopmentServer(root, { host: "127.0.0.1", port: 0, existing: "reject", resume: true });
    const { url } = await server.start();
    const client = new Client({ baseUrl: url });
    const signal = AbortSignal.timeout(60_000);
    const other = new SessionStore({ baseUrl: url });
    const statuses = new Set();
    const unsubscribe = other.subscribe(() => statuses.add(other.snapshot.status));
    const [first] = await Promise.all([
      client.sessions.create({ message: "Lesson A", signal }),
      sendAndSettle(other, { message: "Lesson B", signal }),
    ]);
    const a = await first.delivery.result({ signal });
    stage = "concurrent projections";
    assert.equal(a.status, "completed");
    assert.equal(other.snapshot.status, "idle");
    assert.equal(other.snapshot.error, undefined);
    assert.ok(statuses.has("busy"));
    const aText = reply(a);
    const bText = projectedJson(other);
    assert.deepEqual(aText.history, ["Lesson A"]);
    assert.deepEqual(bText.history, ["Lesson B"]);
    assert.notEqual(aText.sessionId, bText.sessionId);
    assert.equal(aText.selectedModel, `host:${first.session.state.sessionId}`);
    assert.notEqual(aText.selectedModel, bText.selectedModel, "Dynamic selection must use each Eve session's context");
    // Exercise stream attachment timing instead of relying on one lucky startup.
    await Promise.all(Array.from({ length: 6 }, async (_, index) => {
      const probe = new SessionStore({ baseUrl: url });
      const message = `Projection probe ${index}`;
      await sendAndSettle(probe, { message, signal });
      assert.equal(probe.snapshot.error, undefined);
      assert.deepEqual(projectedJson(probe).history, [message]);
    }));
    const continued = await (await first.session.send("Continue A", { signal })).result({ signal });
    stage = "park questions";
    const continuedText = reply(continued);
    assert.equal(continuedText.sessionId, aText.sessionId);
    assert.equal(continuedText.selectedModel, aText.selectedModel);
    assert.deepEqual(continuedText.history, ["Lesson A", "Continue A"]);
    const waiting = await (await first.session.send("Ask before continuing", { signal })).result({ signal });
    assert.equal(waiting.status, "awaiting-input");
    assert.equal(waiting.interactions.length, 1);
    assert.equal(waiting.interactions[0].request.prompt, "Review or continue?");
    const parked = await sendAndSettle(other, { message: "Ask before continuing", signal });
    assert.equal(parked.status, "awaiting-input");
    const [questionPart] = toolParts(other, "ask_question");
    assert.ok(questionPart, JSON.stringify(other.snapshot.messages));
    const question = parked.interactions[0];
    assert.equal(question.request.prompt, "Review or continue?");
    assert.equal(question.status, "open");
    const savedUi = JSON.parse(JSON.stringify({ initialEvents: other.snapshot.events, initialSession: other.snapshot.session }));
    unsubscribe();
    await server.close();
    server = createDevelopmentServer(root, { host: "127.0.0.1", port: 0, existing: "reject", resume: true });
    const restarted = await server.start();
    const rehydrated = new SessionStore({ baseUrl: restarted.url, ...savedUi });
    stage = "restore UI question";
    await rehydrated.resume();
    await idle(rehydrated);
    assert.equal(rehydrated.snapshot.error, undefined);
    assert.equal(rehydrated.snapshot.messages.filter(message => message.role === "user").length, 2, "Optimistic and persisted messages must not duplicate on replay");
    await sendAndSettle(rehydrated, { answers: [{ interactionId: question.interactionId, optionId: "Review" }], signal: AbortSignal.timeout(60_000) });
    assert.equal(rehydrated.snapshot.status, "idle");
    assert.equal(rehydrated.snapshot.error, undefined);
    // The question is a workflow tool: its result completes the outer tool call.
    const [answeredPart] = toolParts(rehydrated, "ask_question");
    assert.equal(answeredPart.state, "completed", JSON.stringify(answeredPart));
    assert.deepEqual(answeredPart.output, { answer: "Review", status: "answered" });
    assert.ok(rehydrated.snapshot.events.some(event => event.type === "interaction.settled"
      && event.data.interactionId === question.interactionId && event.data.outcome === "accepted"
      && event.data.response?.optionId === "Review"), JSON.stringify(rehydrated.snapshot.events.filter(event => event.type.startsWith("interaction."))));
    const uiAnswer = projectedJson(rehydrated);
    assert.equal(uiAnswer.sessionId, bText.sessionId);
    assert.deepEqual(uiAnswer.history.filter(entry => typeof entry === "object"), [{ answer: { status: "answered", answer: "Review" } }]);
    // Reattach with the client's complete saved state, as 1.0 requires.
    const restored = new Client({ baseUrl: restarted.url }).sessions.attach(first.session.state.sessionId, structuredClone(first.session.state));
    stage = "restore client question";
    const answered = await (await restored.respond([{ interactionId: waiting.interactions[0].interactionId, optionId: "Review" }], { signal: AbortSignal.timeout(60_000) })).result();
    assert.equal(answered.status, "completed", JSON.stringify(answered));
    const answerText = reply(answered);
    assert.equal(answerText.sessionId, aText.sessionId);
    assert.equal(answerText.selectedModel, aText.selectedModel);
    const answers = answerText.history.filter(item => typeof item === "object");
    assert.deepEqual(answers, [{ answer: { answer: "Review", status: "answered" } }], JSON.stringify(answerText));
    const send = async (session, message) => {
      const result = await (await session.send(message, { signal: AbortSignal.timeout(60_000) })).result();
      assert.equal(result.status, "completed", JSON.stringify(result));
      return reply(result);
    };
    const recoveredText = await send(restored, "After restart");
    assert.equal(recoveredText.sessionId, aText.sessionId);
    assert.equal(recoveredText.selectedModel, aText.selectedModel);
    assert.deepEqual(recoveredText.history, ["Lesson A", "Continue A", "Ask before continuing", ...answers, "After restart"]);
    stage = "filesystem tools";
    assert.match((await send(restored, "Read lesson note")).history.at(-1).output.content, /Original lesson note/);
    assert.equal((await send(restored, "Write lesson note")).history.at(-1).output.existed, true);
    assert.match((await send(restored, "Read authoring note")).history.at(-1).output.content, /Authored in the editor/);
    await send(restored, "Write authoring note");
    assert.equal(await readFile(join(course, "note.md"), "utf8"), "Edited by Kyoshi.\n");
    stage = "native file changes";
    const nativeFile = join(course, "native.md");
    const native = (op, extra = {}) => `Native fs ${JSON.stringify({ op, path: nativeFile, ...extra })}`;
    assert.deepEqual((await send(restored, native("create", { content: "Created natively.\n" }))).history.at(-1), { native: "create", path: nativeFile });
    assert.equal(await readFile(nativeFile, "utf8"), "Created natively.\n");
    await send(restored, native("write", { content: "Changed natively.\n" }));
    assert.equal(await readFile(nativeFile, "utf8"), "Changed natively.\n");
    await send(restored, native("delete"));
    await assert.rejects(readFile(nativeFile, "utf8"), { code: "ENOENT" });
    const parkedNative = await (await restored.send(native("create", { content: "Written while parked.\n", after: "suspend" }),
      { signal: AbortSignal.timeout(60_000) })).result();
    assert.equal(parkedNative.status, "awaiting-input", JSON.stringify(parkedNative));
    for (const deadline = Date.now() + 5000; Date.now() < deadline;) {
      if (await readFile(nativeFile, "utf8").catch(() => undefined)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(await readFile(nativeFile, "utf8"), "Written while parked.\n");
    const continuedNative = await (await restored.respond([{ interactionId: parkedNative.interactions[0].interactionId, optionId: "Continue" }],
      { signal: AbortSignal.timeout(60_000) })).result();
    assert.equal(continuedNative.status, "completed", JSON.stringify(continuedNative));
    await writeFile(join(course, "note.md"), "Edited again by the human.\n");
    await server.close();
    server = createDevelopmentServer(root, { host: "127.0.0.1", port: 0, existing: "reject", resume: true });
    const finalHost = await server.start();
    const finalSession = new Client({ baseUrl: finalHost.url }).sessions.attach(restored.state.sessionId, structuredClone(restored.state));
    observedSession = finalSession;
    stage = "restore filesystem";
    assert.match((await send(finalSession, "Read authoring note")).history.at(-1).output.content, /Edited again by the human/);
    assert.match((await send(finalSession, "Read lesson note")).history.at(-1).output.content, /Learner progress saved/);
    stage = "dispatch child";
    const delegation = await finalSession.send(specialist ? "Delegate specialist review" : "Delegate lesson review", { signal: AbortSignal.timeout(60_000) });
    stage = "observe delegation admission";
    let opened;
    for await (const event of delegation.stream({ signal: AbortSignal.timeout(60_000) })) {
      assert.notEqual(event.type === "turn.settled" && event.data.outcome, "failed", JSON.stringify(event));
      if (event.type === "child.opened") { opened = event; break; }
    }
    assert.ok(opened);
    const child = finalSession.agent(opened);
    stage = "observe child completion";
    let childReply;
    for await (const event of child.stream({ signal: AbortSignal.timeout(60_000) })) {
      if (event.type === "content.completed" && event.data.phase === "reply") childReply = JSON.parse(event.data.value);
      if (event.type === "turn.settled") {
        assert.equal(event.data.outcome, "completed", JSON.stringify(event));
        break;
      }
    }
    assert.ok(childReply);
    assert.notEqual(childReply.sessionId, aText.sessionId);
    assert.equal(childReply.history.length, specialist ? 2 : 1);
    assert.match(childReply.history[0], /Review this isolated lesson$/);
    assert.ok(!childReply.history[0].includes("Lesson A"));
    if (specialist) {
      assert.equal(childReply.history[1].tool, "read_file");
      assert.match(childReply.history[1].output.content, /Specialist-only evidence/);
      assert.ok(!JSON.stringify(childReply.history).includes("Learner progress saved"));
    }
    // Eve must continue the parent with the actual child answer, not just a
    // dispatch receipt. No user message is sent to manufacture that wake-up.
    stage = "observe parent continuation";
    const delegated = await delegation.result({ signal: AbortSignal.timeout(60_000) });
    assert.equal(delegated.status, "completed", JSON.stringify(delegated));
    assert.ok(delegated.reply?.includes(childReply.sessionId), delegated.reply);
  } catch (cause) {
    if (observedSession) {
      const snapshot = await observedSession.snapshot({ signal: AbortSignal.timeout(2000) }).catch(() => null);
      console.error("HOST_FAILURE_SNAPSHOT", JSON.stringify(snapshot));
    }
    throw new Error(`Workflow host failed during ${stage} (specialist=${specialist})`, { cause });
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
    await rm(course, { recursive: true, force: true });
  }
});
