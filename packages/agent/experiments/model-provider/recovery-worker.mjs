import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createJustBashSandbox } from "@ai-sdk/sandbox-just-bash";
import { generateText, jsonSchema, tool } from "ai";
import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";

// Independent process/adapter fixture: its only native memory is the SDK handle.
// This verifies provider transport and SDK recovery, not any vendor's persistence.
const starts = [];
const toolResults = [];
const toolApprovals = [];
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const finishReason = { unified: "stop", raw: "stop" };
const harness = {
  harnessId: "provider-fixture", specificationVersion: "harness-v1", builtinTools: {},
  async doStart(options) {
    const checkpoint = options.continueFrom ?? options.resumeFrom;
    assert.ok(checkpoint, "Recovery must not silently start a new native session");
    const history = structuredClone(checkpoint.data.history);
    starts.push(options.sessionId);
    return {
      sessionId: options.sessionId, isResume: true,
      async doContinueTurn(turn) {
        const done = Promise.withResolvers();
        if (options.continueFrom?.data.approvalFixture) {
          turn.emit({ type: "tool-call", toolCallId: "native-approval", toolName: "shell", input: '{"command":"write file"}', providerExecuted: true, dynamic: true });
          turn.emit({ type: "tool-approval-request", approvalId: "permission-1", toolCallId: "native-approval" });
          return { done: done.promise, async submitToolResult() {}, async submitToolApproval(answer) {
            toolApprovals.push(answer);
            turn.emit({ type: "tool-result", toolCallId: "native-approval", toolName: "shell", result: answer.approved ? "Written" : "Denied", dynamic: true });
            turn.emit({ type: "text-start", id: "t" });
            turn.emit({ type: "text-delta", id: "t", delta: answer.approved ? "Approved and finished." : "Denied safely." });
            turn.emit({ type: "text-end", id: "t" });
            turn.emit({ type: "finish-step", finishReason, usage });
            turn.emit({ type: "finish", finishReason, totalUsage: usage });
            done.resolve();
          } };
        }
        turn.emit({ type: "tool-call", toolCallId: "echo-1", toolName: "echo", input: '{"value":"receipt"}' });
        return {
          done: done.promise,
          async submitToolResult(result) {
            toolResults.push(result);
            turn.emit({ type: "tool-result", toolCallId: result.toolCallId, toolName: "echo", result: result.output, isError: result.isError });
            turn.emit({ type: "finish-step", finishReason: { unified: "tool-calls" }, usage });
            turn.emit({ type: "text-start", id: "t" });
            turn.emit({ type: "text-delta", id: "t", delta: `Student chose: ${result.output}` });
            turn.emit({ type: "text-end", id: "t" });
            turn.emit({ type: "finish-step", finishReason, usage });
            turn.emit({ type: "finish", finishReason, totalUsage: usage });
            done.resolve();
          },
        };
      },
      async doPromptTurn(turn) {
        history.push(turn.prompt);
        for (const event of [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: JSON.stringify(history) },
          { type: "text-end", id: "t" },
          { type: "finish-step", finishReason, usage },
          { type: "finish", finishReason, totalUsage: usage },
        ]) turn.emit(event);
        return { done: Promise.resolve(), async submitToolResult() {} };
      },
      async doStop() { return { type: "resume-session", harnessId: "provider-fixture", specificationVersion: "harness-v1", data: { history } }; },
      async doDestroy() {},
    };
  },
};
const sandbox = createJustBashSandbox();
const { model } = experimental_createHarnessModel({ harness, sandbox: { ...sandbox, resumeSession: options => sandbox.createSession(options) } });
const conversations = JSON.parse(readFileSync(0, "utf8"));
const tools = { echo: tool({ inputSchema: jsonSchema({ type: "object", properties: { value: { type: "string" } }, required: ["value"] }) }) };
const results = await Promise.all(conversations.map(messages => generateText({ model, messages, tools })));
process.stdout.write(JSON.stringify({ starts, toolResults, toolApprovals, texts: results.map(result => result.text) }));
