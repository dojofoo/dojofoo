import { generateText } from "ai";
import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";
import { createRuntime } from "./opencode-runtime.fixture.mjs";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const { root, baseURL, messages } = JSON.parse(input);
const { sandboxSession, runtime } = await createRuntime(root, baseURL);
try {
  const { model } = experimental_createHarnessModel(runtime, { sandboxSession });
  const result = await generateText({ model, messages, maxRetries: 0, abortSignal: AbortSignal.timeout(90000) });
  process.stdout.write(JSON.stringify({ pid: process.pid, text: result.text, messages: result.response.messages }));
} finally { await sandboxSession.stop(); }
