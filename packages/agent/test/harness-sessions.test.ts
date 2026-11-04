import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evictHarnessSession, experimental_createHarnessModel, ResumeFailedError } from "../src/harness-model.ts";
import { createLocalHarnessSandbox } from "../src/local-harness-sandbox.ts";
import type { ResumeFailure } from "@dojofoo/protocol";
import { fakeHarness, reply, userPrompt } from "./fake-harness.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const eveTool = { type: "function" as const, name: "dojo_context", description: "Context", inputSchema: { type: "object" as const, properties: {} } };

function parkingHarness() {
  return fakeHarness({ script: ({ prompt, emit }) => {
    if (prompt !== "Use the tool.") return reply(emit, "Ready to teach.");
    emit({ type: "tool-call", toolCallId: "context-1", toolName: "dojo_context", input: "{}" });
    emit({ type: "finish-step", finishReason: { unified: "tool-calls" }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } } });
  } });
}

async function evictingSandbox() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-harness-sessions-")));
  roots.push(root);
  const sandbox = createLocalHarnessSandbox(root);
  const evicted: string[] = [];
  return { evicted, sandbox: { ...sandbox, evict: async (id: string) => { evicted.push(id); await sandbox.evict(id); } } };
}

describe("harness session map", () => {
  it("a detached session is tracked under its Eve session id and evicted by stopping its sandbox", async () => {
    const native = parkingHarness();
    const { sandbox, evicted } = await evictingSandbox();
    const { model } = experimental_createHarnessModel({ harness: native.harness, sandbox }, { mode: "full", eveSessionId: "eve-tracked" });
    const parked = await model.doGenerate({ prompt: userPrompt("Use the tool."), tools: [eveTool] });
    expect(parked.content.some(part => part.type === "tool-call")).toBe(true);
    expect(await evictHarnessSession("eve-tracked")).toBe(true);
    expect(evicted).toEqual([native.starts[0]?.sessionId]);
    expect(await evictHarnessSession("eve-tracked")).toBe(false);
  });

  it("a stopped session is forgotten", async () => {
    const native = parkingHarness();
    const { sandbox, evicted } = await evictingSandbox();
    const { model } = experimental_createHarnessModel({ harness: native.harness, sandbox }, { mode: "full", eveSessionId: "eve-stopped" });
    const parked = await model.doGenerate({ prompt: userPrompt("Use the tool."), tools: [eveTool] });
    const call = parked.content.find(part => part.type === "tool-call") as { toolCallId: string; toolName: string; input: string; providerMetadata?: never };
    const finished = await model.doGenerate({ tools: [eveTool], prompt: [...userPrompt("Use the tool."),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: call.toolCallId, toolName: call.toolName, input: JSON.parse(call.input), providerOptions: call.providerMetadata }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: call.toolCallId, toolName: call.toolName, output: { type: "json", value: { ok: true } } }] }] });
    expect(finished.content.some(part => part.type === "text")).toBe(true);
    expect(await evictHarnessSession("eve-stopped")).toBe(false);
    expect(evicted).toEqual([]);
  });

  it("a failed resume is reported once and rethrown without a status code", async () => {
    const native = fakeHarness();
    const { sandbox } = await evictingSandbox();
    const failures: ResumeFailure[] = [];
    const failing = { ...sandbox, resumeSession: async () => { throw new Error("The native session is gone."); } };
    const { model } = experimental_createHarnessModel({ harness: native.harness, sandbox: failing },
      { mode: "read-only", agent: "codex", eveSessionId: "eve-failed", onResumeFailure: failure => { failures.push(failure); } });
    const first = await model.doGenerate({ prompt: userPrompt("Begin.") });
    const text = first.content.find(part => part.type === "text") as { text: string; providerMetadata?: never };
    const error = await model.doGenerate({ prompt: [...userPrompt("Begin."),
      { role: "assistant", content: [{ type: "text", text: text.text, providerOptions: text.providerMetadata }] }, ...userPrompt("Continue.")] }).catch(failure => failure);
    expect(error).toBeInstanceOf(ResumeFailedError);
    expect(error).not.toHaveProperty("statusCode");
    expect(failures).toEqual([expect.objectContaining({ sessionId: "eve-failed", agent: "codex", message: expect.stringContaining("The native session is gone.") })]);
  });
});
