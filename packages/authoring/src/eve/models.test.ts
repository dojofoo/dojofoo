import { describe, expect, it, vi } from "vitest";
import { codexModels, parseOpenCodeModels, piModels } from "./models.ts";

const createModelRuntime = vi.hoisted(() => vi.fn());
const thinkingLevels = vi.hoisted(() => vi.fn());
vi.mock("@earendil-works/pi-coding-agent", () => ({ ModelRuntime: { create: createModelRuntime } }));
vi.mock("@earendil-works/pi-ai/compat", () => ({ getSupportedThinkingLevels: thinkingLevels }));

const server = (response: string) => ["--input-type=module", "-e", `
  import { createInterface } from 'node:readline';
  createInterface({ input: process.stdin }).on('line', line => {
    const request = JSON.parse(line);
    if (!('id' in request)) return;
    const result = request.method === 'initialize' ? {} : (${response});
    process.stdout.write(JSON.stringify({ id: request.id, result }) + '\\n');
  });
`];

describe("native model discovery", () => {
  it("uses Pi's configured availability without exposing credentials or inventing effort support", async () => {
    thinkingLevels.mockReturnValueOnce(["off", "high"]);
    const model = { provider: "custom", id: "reasoner", name: "Local reasoner", reasoning: true, apiKey: "private" };
    createModelRuntime.mockResolvedValueOnce({ getError: () => undefined, getAvailableSnapshot: () => [
      model,
    ] });
    const signal = AbortSignal.timeout(2000);
    expect(await piModels(signal, "/fixture/pi")).toEqual([{ id: "custom/reasoner", name: "Local reasoner", efforts: ["off", "high"] }]);
    expect(thinkingLevels).toHaveBeenLastCalledWith(model);
    expect(createModelRuntime).toHaveBeenLastCalledWith({ authPath: "/fixture/pi/auth.json", modelsPath: "/fixture/pi/models.json", allowModelNetwork: false, signal });
  });
  it("surfaces Pi configuration failures", async () => {
    createModelRuntime.mockResolvedValueOnce({ getError: () => "Invalid provider configuration" });
    await expect(piModels(AbortSignal.timeout(2000), "/fixture/pi")).rejects.toThrow("Invalid provider configuration");
  });
  it("accepts only provider/model output from OpenCode", () => {
    expect(parseOpenCodeModels("zai/glm-5.3\ndeepseek/v4\nzai/glm-5.3\n")).toEqual([
      { id: "zai/glm-5.3", name: "zai/glm-5.3", efforts: [] },
      { id: "deepseek/v4", name: "deepseek/v4", efforts: [] },
    ]);
    expect(() => parseOpenCodeModels("Error: authentication failed")).toThrow("invalid model catalog");
  });
  it("uses Codex's catalog and advertised efforts across pages without creating a turn", async () => {
    const models = await codexModels(AbortSignal.timeout(2000), process.execPath, server(`
      request.method !== 'model/list' ? null : request.params.cursor ? {
        data: [{ model: 'second', displayName: 'Second', supportedReasoningEfforts: [] }], nextCursor: null
      } : {
        data: [{ model: 'first', displayName: 'First', supportedReasoningEfforts: [{ reasoningEffort: 'high' }], defaultReasoningEffort: 'high' }], nextCursor: 'page2'
      }
    `));
    expect(models).toEqual([
      { id: "first", name: "First", efforts: ["high"], defaultEffort: "high" },
      { id: "second", name: "Second", efforts: [], defaultEffort: undefined },
    ]);
  });
  it("rejects a broken catalog rather than silently returning an empty dropdown", async () => {
    await expect(codexModels(AbortSignal.timeout(2000), process.execPath, server("{}"))).rejects.toThrow("invalid model catalog");
  });
  it("stops repeated pagination", async () => {
    await expect(codexModels(AbortSignal.timeout(2000), process.execPath, server("{ data: [], nextCursor: 'same' }"))).rejects.toThrow("repeated");
  });
  it("rejects process startup failure", async () => {
    await expect(codexModels(AbortSignal.timeout(2000), "/does-not-exist/dojo-codex")).rejects.toThrow("ENOENT");
  });
  it("cancels an unresponsive catalog without waiting for a model turn", async () => {
    await expect(codexModels(AbortSignal.timeout(50), process.execPath, ["-e", "setInterval(() => {}, 1000)"])).rejects.toThrow("cancelled");
  });
});
