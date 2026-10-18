import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createPi } from "@ai-sdk/harness-pi";
import { generateText, jsonSchema, tool } from "ai";
import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";
import { createLocalSandbox } from "@dojofoo/agent/experimental/local";
import { startLoopbackModel } from "./loopback-openai.mjs";

test("Pi native filesystem remains usable after an Eve-owned tool boundary", { timeout: 60000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "pi-local-continuation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, "home");
  await mkdir(home);
  const sandboxSession = await createLocalSandbox(root, { environment: { HOME: home, PATH: process.env.PATH } });
  t.after(() => sandboxSession.stop());
  const endpoint = await startLoopbackModel({
    selectResponsesTool: (_input, requested) => [
      { name: "bash", input: { command: "pwd" } },
      { name: "ask_question", input: { prompt: "Continue?" } },
      { name: "bash", input: { command: "pwd" } },
    ][requested.length],
  });
  t.after(() => endpoint.close());
  const { model } = experimental_createHarnessModel({
    harness: createPi({ agentDir: join(home, ".pi/agent"), auth: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: endpoint.baseURL } }),
    model: "openai/gpt-4o",
    permissionMode: "allow-all",
  }, { sandboxSession });
  const tools = { ask_question: tool({
      inputSchema: jsonSchema({ type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] }),
    }) };
  const first = await generateText({ model, tools, prompt: "Read the current directory, ask, then read it again." });
  assert.ok(first.response.messages.some(message => JSON.stringify(message).includes("resumeFrom")), JSON.stringify(first.response.messages));
  const call = first.toolCalls.find(call => call.toolName === "ask_question");
  assert.ok(call);
  const result = await generateText({ model, tools, messages: [
    { role: "user", content: "Read the current directory, ask, then read it again." },
    ...first.response.messages,
    { role: "tool", content: [{ type: "tool-result", toolCallId: call.toolCallId, toolName: "ask_question", output: { type: "text", value: "Continue" } }] },
  ] });
  assert.equal(result.text, "Ready to teach.");
  assert.deepEqual(endpoint.requestedTools, ["bash", "ask_question", "bash"]);
  const evidence = JSON.stringify(endpoint.requests);
  assert.doesNotMatch(evidence, /Local sandbox has stopped/);
  assert.match(evidence, /pi-local-continuation-/);
});
