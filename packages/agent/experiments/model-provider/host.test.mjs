import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { Client, EveAgentStore, defaultMessageReducer } from "@dojofoo/agent/client";
import { createAuthoringSandbox } from "./authoring-sandbox.ts";

import { createDevelopmentServer } from "@dojofoo/agent/server";

function projectedJson(store) {
  const projectedReply = store.snapshot.data.messages.at(-1).parts.filter(part => part.type === "text").map(part => part.text).join("");
  try { return JSON.parse(projectedReply); }
  catch (cause) {
    throw new Error(JSON.stringify({ projectedReply, messages: store.snapshot.data.messages, events: store.snapshot.events }), { cause });
  }
}

test("authoring rejects ambiguous or filesystem-root mounts", () => {
  for (const path of [".", "relative/course", "/", "/tmp/.."])
    assert.throws(() => createAuthoringSandbox(path), /absolute course directory/);
});

for (const specialist of [false, true]) test(`Eve's HTTP workflow host isolates conversations, recovers, and delegates (specialist=${specialist})`, { timeout: 180_000 }, async () => {
  const root = await mkdtemp(join(process.cwd(), "hosted-provider-"));
  let server;
  let stage = "prepare host";
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "hosted-provider-fixture", private: true, type: "module" }));
    await copyFile(new URL("host-agent.fixture.ts", import.meta.url), join(root, "agent.ts"));
    await writeFile(join(root, "instructions.md"), "HOST_INSTRUCTIONS_LOADED: Teach one concept at a time.\n");
    await mkdir(join(root, "tools"));
    await writeFile(join(root, "tools/ask_question.ts"), 'export { default } from "@dojofoo/agent/tools/ask_question";\n');
    await writeFile(join(root, "tools/read_file.ts"), 'export { default } from "@dojofoo/agent/tools/read_file";\n');
    await writeFile(join(root, "tools/root_only.ts"), 'import { defineTool } from "@dojofoo/agent/tools"; import read from "@dojofoo/agent/tools/read_file"; export default defineTool({ ...read, description: "Root-only lesson evidence lookup." });\n');
    await writeFile(join(root, "tools/write_file.ts"), 'export { default } from "@dojofoo/agent/tools/write_file";\n');
    await mkdir(join(root, "sandbox/workspace"), { recursive: true });
    await mkdir(join(root, "course"));
    await writeFile(join(root, "course/note.md"), "Authored in the editor.\n");
    await copyFile(new URL("authoring-sandbox.ts", import.meta.url), join(root, "authoring-sandbox.ts"));
    await writeFile(join(root, "sandbox/sandbox.ts"), `import { createAuthoringSandbox } from "../authoring-sandbox"; export default createAuthoringSandbox(${JSON.stringify(join(root, "course"))});\n`);
    await writeFile(join(root, "sandbox/workspace/note.md"), "Original lesson note.\n");
    if (specialist) {
      await mkdir(join(root, "subagents/reviewer/tools"), { recursive: true });
      await mkdir(join(root, "subagents/reviewer/sandbox/workspace"), { recursive: true });
      await writeFile(join(root, "subagents/reviewer/agent.ts"), 'import { defineAgent } from "@dojofoo/agent"; import root from "../../agent"; export default defineAgent({ ...root, description: "Review lesson evidence independently." });\n');
      await writeFile(join(root, "subagents/reviewer/instructions.md"), "SPECIALIST_INSTRUCTIONS_LOADED: Read your own lesson evidence before reviewing.\n");
      await copyFile(join(root, "tools/read_file.ts"), join(root, "subagents/reviewer/tools/read_file.ts"));
      await writeFile(join(root, "subagents/reviewer/sandbox/sandbox.ts"), 'import { defineSandbox } from "@dojofoo/agent/sandbox"; import { justbash } from "@dojofoo/agent/sandbox/just-bash"; export default defineSandbox({ backend: justbash({ autoInstall: false }) });\n');
      await writeFile(join(root, "subagents/reviewer/sandbox/workspace/note.md"), "Specialist-only evidence.\n");
    }
    server = createDevelopmentServer(root, { host: "127.0.0.1", port: 0, existing: "reject" });
    const { url } = await server.start();
    const client = new Client({ host: url });
    const signal = AbortSignal.timeout(60_000);
    const other = new EveAgentStore({ host: url, reducer: defaultMessageReducer() });
    const statuses = new Set();
    const unsubscribe = other.subscribe(() => statuses.add(other.snapshot.status));
    const [first] = await Promise.all([
      client.sessions.create({ message: "Lesson A", signal }),
      other.send({ message: "Lesson B", signal }),
    ]);
    const a = await first.response.result();
    stage = "concurrent projections";
    assert.equal(a.status, "waiting");
    assert.equal(other.snapshot.status, "ready");
    assert.equal(other.snapshot.error, undefined);
    assert.ok(statuses.has("submitted"));
    assert.ok(statuses.has("streaming"));
    const aText = JSON.parse(a.message);
    const bText = projectedJson(other);
    assert.deepEqual(aText.history, ["Lesson A"]);
    assert.deepEqual(bText.history, ["Lesson B"]);
    assert.notEqual(aText.sessionId, bText.sessionId);
    assert.equal(aText.selectedModel, `host:${first.session.state.sessionId}`);
    assert.notEqual(aText.selectedModel, bText.selectedModel, "Dynamic selection must use each Eve session's context");
    // Exercise stream attachment timing instead of relying on one lucky startup.
    await Promise.all(Array.from({ length: 6 }, async (_, index) => {
      const probe = new EveAgentStore({ host: url, reducer: defaultMessageReducer() });
      const message = `Projection probe ${index}`;
      await probe.send({ message, signal });
      assert.equal(probe.snapshot.error, undefined);
      assert.deepEqual(projectedJson(probe).history, [message]);
    }));
    const continued = await (await first.session.send("Continue A", { signal })).result();
    stage = "park questions";
    const continuedText = JSON.parse(continued.message);
    assert.equal(continuedText.sessionId, aText.sessionId);
    assert.equal(continuedText.selectedModel, aText.selectedModel);
    assert.deepEqual(continuedText.history, ["Lesson A", "Continue A"]);
    const waiting = await (await first.session.send("Ask before continuing", { signal })).result();
    assert.equal(waiting.inputRequests.length, 1);
    assert.equal(waiting.inputRequests[0].prompt, "Review or continue?");
    await other.send({ message: "Ask before continuing", signal });
    const questionPart = other.snapshot.data.messages.flatMap(message => message.parts)
      .find(part => part.type === "dynamic-tool" && part.toolName === "ask_question");
    assert.equal(questionPart.state, "approval-requested");
    assert.equal(questionPart.toolMetadata.eve.inputRequest.prompt, "Review or continue?");
    const savedUi = JSON.parse(JSON.stringify({ initialEvents: other.snapshot.events, initialSession: other.snapshot.session }));
    unsubscribe();
    await server.close();
    server = createDevelopmentServer(root, { host: "127.0.0.1", port: 0, existing: "reject" });
    const restarted = await server.start();
    const rehydrated = new EveAgentStore({ host: restarted.url, reducer: defaultMessageReducer(), ...savedUi });
    stage = "restore UI question";
    await rehydrated.resume();
    assert.equal(rehydrated.snapshot.error, undefined);
    assert.equal(rehydrated.snapshot.data.messages.filter(message => message.role === "user").length, 2, "Optimistic and persisted messages must not duplicate on replay");
    await rehydrated.send({ inputResponses: [{ requestId: questionPart.toolMetadata.eve.inputRequest.requestId, optionId: "review" }], signal: AbortSignal.timeout(60_000) });
    assert.equal(rehydrated.snapshot.status, "ready");
    assert.equal(rehydrated.snapshot.error, undefined);
    const answeredPart = rehydrated.snapshot.data.messages.flatMap(message => message.parts)
      .find(part => part.type === "dynamic-tool" && part.toolName === "ask_question");
    // Native questions resolve input; unlike ordinary tools they do not emit
    // action.result. Render their retained inputResponse as the locked answer.
    assert.equal(answeredPart.state, "approval-responded");
    assert.equal(answeredPart.toolMetadata.eve.inputResponse.optionId, "review");
    assert.ok(rehydrated.snapshot.events.some(event => event.type === "input.resolved"
      && event.data.resolutions.some(resolution => resolution.requestId === questionPart.toolMetadata.eve.inputRequest.requestId && resolution.outcome === "answered")));
    const uiAnswer = JSON.parse(rehydrated.snapshot.data.messages.at(-1).parts.filter(part => part.type === "text").map(part => part.text).join(""));
    assert.equal(uiAnswer.sessionId, bText.sessionId);
    assert.deepEqual(uiAnswer.history.filter(entry => typeof entry === "object"), [{ answer: { status: "answered", optionId: "review" } }]);
    // Respond has no new message delivery ID; preserve the client's durable
    // cursor so it does not mistake an earlier turn boundary for this answer.
    const restored = new Client({ host: restarted.url }).sessions.attach(first.session.state.sessionId, { streamIndex: first.session.state.streamIndex });
    stage = "restore client question";
    const answered = await (await restored.respond([{ requestId: waiting.inputRequests[0].requestId, optionId: "review" }], { signal: AbortSignal.timeout(60_000) })).result();
    const answerText = JSON.parse(answered.message);
    assert.equal(answerText.sessionId, aText.sessionId);
    assert.equal(answerText.selectedModel, aText.selectedModel);
    const answers = answerText.history.filter(item => typeof item === "object");
    assert.deepEqual(answers, [{ answer: { optionId: "review", status: "answered" } }], JSON.stringify({ answerText, events: answered.events }));
    const afterRestart = await (await restored.send("After restart", { signal: AbortSignal.timeout(60_000) })).result();
    const recoveredText = JSON.parse(afterRestart.message);
    assert.equal(recoveredText.sessionId, aText.sessionId);
    assert.equal(recoveredText.selectedModel, aText.selectedModel);
    assert.deepEqual(recoveredText.history, ["Lesson A", "Continue A", "Ask before continuing", ...answers, "After restart"]);
    const read = await (await restored.send("Read lesson note", { signal: AbortSignal.timeout(60_000) })).result();
    stage = "filesystem tools";
    assert.match(JSON.parse(read.message).history.at(-1).output.content, /Original lesson note/);
    const written = await (await restored.send("Write lesson note", { signal: AbortSignal.timeout(60_000) })).result();
    assert.equal(JSON.parse(written.message).history.at(-1).output.existed, true);
    const courseRead = await (await restored.send("Read authoring note", { signal: AbortSignal.timeout(60_000) })).result();
    assert.match(JSON.parse(courseRead.message).history.at(-1).output.content, /Authored in the editor/);
    await (await restored.send("Write authoring note", { signal: AbortSignal.timeout(60_000) })).result();
    assert.equal(await readFile(join(root, "course/note.md"), "utf8"), "Edited by Kyoshi.\n");
    await writeFile(join(root, "course/note.md"), "Edited again by the human.\n");
    await server.close();
    server = createDevelopmentServer(root, { host: "127.0.0.1", port: 0, existing: "reject" });
    const finalHost = await server.start();
    const finalSession = new Client({ host: finalHost.url }).sessions.attach(restored.state.sessionId, { streamIndex: restored.state.streamIndex });
    stage = "restore filesystem";
    const courseAfterRestart = await (await finalSession.send("Read authoring note", { signal: AbortSignal.timeout(60_000) })).result();
    assert.match(JSON.parse(courseAfterRestart.message).history.at(-1).output.content, /Edited again by the human/);
    const reread = await (await finalSession.send("Read lesson note", { signal: AbortSignal.timeout(60_000) })).result();
    assert.match(JSON.parse(reread.message).history.at(-1).output.content, /Learner progress saved/);
    const delegation = await (await finalSession.send(specialist ? "Delegate specialist review" : "Delegate lesson review", { signal: AbortSignal.timeout(60_000) })).result();
    stage = "observe delegation admission";
    assert.equal(delegation.status, "waiting", JSON.stringify(delegation));
    let called = delegation.events.find(event => event.type === "subagent.called");
    // Background admission can arrive after the initiating response boundary.
    if (!called) {
      for await (const event of finalSession.stream({ signal: AbortSignal.timeout(60_000) })) {
        assert.notEqual(event.type, "session.failed", JSON.stringify(event));
        if (event.type === "subagent.called") { called = event; break; }
      }
    }
    assert.ok(called);
    const child = new Client({ host: finalHost.url }).sessions.attach(called.data.childSessionId);
    stage = "observe child completion";
    let childReply;
    for await (const event of child.stream({ signal: AbortSignal.timeout(60_000) })) {
      assert.notEqual(event.type, "turn.failed", JSON.stringify(event));
      if (event.type === "message.completed" && event.data.message) childReply = JSON.parse(event.data.message);
      if (event.type === "turn.completed") break;
    }
    assert.ok(childReply);
    assert.notEqual(childReply.sessionId, aText.sessionId);
    assert.equal(childReply.history.length, specialist ? 2 : 1);
    assert.match(childReply.history[0], /Caller message:\nReview this isolated lesson$/);
    assert.ok(!childReply.history[0].includes("Lesson A"));
    if (specialist) {
      assert.equal(childReply.history[1].tool, "read_file");
      assert.match(childReply.history[1].output.content, /Specialist-only evidence/);
      assert.ok(!JSON.stringify(childReply.history).includes("Learner progress saved"));
    }
    // Eve must wake the parent with the actual child answer, not just return a
    // dispatch receipt. No user message is sent to manufacture that wake-up.
    let parentReceivedAnswer = false;
    stage = "observe automatic parent wake-up";
    for await (const event of finalSession.stream({ signal: AbortSignal.timeout(60_000) })) {
      assert.notEqual(event.type, "session.failed", JSON.stringify(event));
      assert.notEqual(event.type, "turn.failed", JSON.stringify(event));
      if (event.type === "message.completed" && event.data.message?.includes(childReply.sessionId)) {
        parentReceivedAnswer = true;
        break;
      }
    }
    assert.ok(parentReceivedAnswer);
  } catch (cause) {
    throw new Error(`Workflow host failed during ${stage} (specialist=${specialist})`, { cause });
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
