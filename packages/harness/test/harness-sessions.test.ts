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

  it("the turn after a cancel never resumes the sandbox the cancelled turn is still stopping", async () => {
    // As OpenCode's bridge after a learner's Stop: the abort kills it, and its stop then waits 5 s for a reply
    const base = fakeHarness();
    const release = Promise.withResolvers<void>();
    const harness = { ...base.harness, async doStart(start: Parameters<typeof base.harness.doStart>[0]) {
      const native = await base.harness.doStart(start);
      let holding = false;
      return { ...native,
        async doPromptTurn(turn: { prompt: string; emit: (event: Record<string, unknown>) => void; abortSignal?: AbortSignal }) {
          if (turn.prompt !== "Hold.") return native.doPromptTurn(turn);
          holding = true;
          const done = Promise.withResolvers<void>();
          turn.emit({ type: "text-start", id: "h" });
          turn.emit({ type: "text-delta", id: "h", delta: "Holding" });
          turn.abortSignal?.addEventListener("abort", () => done.reject(turn.abortSignal?.reason), { once: true });
          return { done: done.promise, async submitToolResult() {}, async submitToolApproval() {} };
        },
        async doStop() { if (holding) await release.promise; return native.doStop(); },
        async doSuspendTurn() { if (holding) await release.promise; return native.doSuspendTurn(); },
      };
    } };
    const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-harness-sessions-")));
    roots.push(root);
    const local = createLocalHarnessSandbox(root);
    const handed: unknown[] = [];
    const sandbox = { ...local,
      createSession: async (input?: Parameters<typeof local.createSession>[0]) => { const session = await local.createSession(input); handed.push(session); return session; },
      resumeSession: async (input: Parameters<typeof local.resumeSession>[0]) => { const session = await local.resumeSession(input); handed.push(session); return session; } };
    const { model } = experimental_createHarnessModel({ harness, sandbox }, { mode: "full", eveSessionId: "eve-cancelled" });
    const first = await model.doGenerate({ prompt: userPrompt("Begin.") });
    const text = first.content.find(part => part.type === "text") as { text: string; providerMetadata?: never };
    const history = [...userPrompt("Begin."), { role: "assistant" as const, content: [{ type: "text" as const, text: text.text, providerOptions: text.providerMetadata }] }];
    const held = await model.doStream({ prompt: [...history, ...userPrompt("Hold.")] });
    const reader = held.stream.getReader();
    while ((await reader.read()).value?.type !== "text-delta");
    const cancelled = reader.cancel(new Error("Cancelled by the learner")).catch(() => {});
    const next = await model.doGenerate({ prompt: [...history, ...userPrompt("Ask.")] });
    expect(next.content.some(part => part.type === "text")).toBe(true);
    expect(handed).toHaveLength(3);
    expect(handed[2]).not.toBe(handed[1]);
    release.resolve();
    await cancelled;
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
