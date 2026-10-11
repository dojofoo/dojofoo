import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

// Exercise the installed upstream bridge, including our narrow dependency patch.
// Import only these pure helpers: importing the entrypoint would start its server.
const source = await readFile(new URL("./bridge/index.mjs", import.meta.resolve("@ai-sdk/harness-opencode")), "utf8");
const promptSource = source.slice(source.indexOf("async function legacySessionPrompt("), source.indexOf("async function legacySessionSummarize("));
const modelStart = source.indexOf("function modelRefFromStart(");
const modelSource = source.slice(modelStart, source.indexOf("\nfunction ", modelStart + 1));
const splitStart = source.indexOf("function splitModel(");
const splitSource = source.slice(splitStart, source.indexOf("\nfunction ", splitStart + 1));
const { legacySessionPrompt } = await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(`const procEnv2 = {};\n${splitSource}\n${modelSource}\n${promptSource}\nexport { legacySessionPrompt };`)}`);

describe("OpenCode model selection", () => {
  it("does not mix a legacy session with the v2 model-switch endpoint", () => {
    const turn = source.slice(source.indexOf("async function runTurn("), source.indexOf("async function ensureRuntime("));
    expect(turn).not.toContain("switchSessionModel");
    expect(turn).not.toContain("client.v2.session.switchModel");
  });

  it.each(["promptAsync", "prompt"])("selects the initial and changed model through %s without changing session", async (method) => {
    const submit = vi.fn().mockResolvedValue({ data: {} });
    const client = { session: { [method]: submit } };
    for (const model of ["zai-coding-plan/glm-5.3", "zai-coding-plan/glm-5.3", "huggingface/deepseek-ai/DeepSeek-V4-Pro"]) {
      await legacySessionPrompt({ client, sessionId: "existing-session", start: { model, prompt: "Continue", instructions: "Teach", variant: "high" } });
    }
    expect(submit.mock.calls.map(([request]) => request.model)).toEqual([
      { providerID: "zai-coding-plan", modelID: "glm-5.3" },
      { providerID: "zai-coding-plan", modelID: "glm-5.3" },
      { providerID: "huggingface", modelID: "deepseek-ai/DeepSeek-V4-Pro" },
    ]);
    for (const [request] of submit.mock.calls) {
      expect(request).toMatchObject({ sessionID: "existing-session", system: "Teach", variant: "high", parts: [{ type: "text", text: "Continue" }] });
    }
  });

  it("keeps native default selection when no model is specified", async () => {
    const promptAsync = vi.fn().mockResolvedValue({ data: {} });
    await legacySessionPrompt({ client: { session: { promptAsync } }, sessionId: "existing-session", start: { prompt: "Continue" } });
    expect(promptAsync.mock.calls[0][0]).not.toHaveProperty("model");
  });
});
