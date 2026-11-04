import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acpModels, codexModels, configuredHarnessModel, fxModels, parseFxModels, parseOpenCodeModels, piModels } from "./models.ts";

const createModelRuntime = vi.hoisted(() => vi.fn());
const thinkingLevels = vi.hoisted(() => vi.fn());
vi.mock("@earendil-works/pi-coding-agent", () => ({ ModelRuntime: { create: createModelRuntime } }));
vi.mock("@earendil-works/pi-ai/models", () => ({ getSupportedThinkingLevels: thinkingLevels }));

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
  it("uses Codex's configured model without confusing nested TOML settings with the root model", async () => {
    const home = await mkdtemp(join(tmpdir(), "dojo-codex-config-"));
    try {
      expect(await configuredHarnessModel("codex", home)).toBeUndefined();
      await writeFile(join(home, "config.toml"), `model = 'configured-model' # native choice\n[profiles.other]\nmodel = "other-model"\n`);
      expect(await configuredHarnessModel("codex", home)).toBe("configured-model");
      expect(await configuredHarnessModel("opencode", home)).toBeUndefined();
    } finally { await rm(home, { recursive: true, force: true }); }
  });
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
  it("accepts only FX's JSON model list", () => {
    expect(parseFxModels(JSON.stringify({ kind: "models", ids: ["gpt-6-sol", "gpt-6-luna", "gpt-6-sol"] }))).toEqual([
      { id: "gpt-6-sol", name: "gpt-6-sol", efforts: [] },
      { id: "gpt-6-luna", name: "gpt-6-luna", efforts: [] },
    ]);
    expect(() => parseFxModels("Error: not signed in")).toThrow("invalid model catalog");
  });
  it("lists FX models through its CLI without starting a session", async () => {
    expect(await fxModels(AbortSignal.timeout(2000), process.execPath, ["-e", "process.stdout.write(JSON.stringify({ kind: 'models', ids: ['a'] }))"]))
      .toEqual([{ id: "a", name: "a", efforts: [] }]);
  });
  it("lists no FX models when the CLI is not installed", async () => {
    expect(await fxModels(AbortSignal.timeout(2000), null)).toEqual([]);
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

// A fake ACP agent: answers initialize and session/new, records every method in a log file, and may advertise session/close
const acpServer = (log: string, session: string, close: boolean) => ["--input-type=module", "-e", `
  import { appendFileSync } from 'node:fs';
  import { createInterface } from 'node:readline';
  appendFileSync(${JSON.stringify(log)}, 'pid ' + process.pid + '\\n');
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: {} }) + '\\n');
  createInterface({ input: process.stdin }).on('line', line => {
    const request = JSON.parse(line);
    appendFileSync(${JSON.stringify(log)}, request.method + '\\n');
    if (!('id' in request)) return;
    const result = request.method === 'initialize' ? { protocolVersion: 1, agentCapabilities: ${close ? "{ sessionCapabilities: { close: {}, delete: {} } }" : "{}"} }
      : request.method === 'session/new' ? ${session} : {};
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');
  });
`];

describe("ACP model probes", () => {
  it("lists Cursor models from an ACP probe's configOptions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dojo-acp-models-"));
    try {
      const session = `{ sessionId: 's1', configOptions: [{ id: 'mode', type: 'select', options: [{ value: 'ask', name: 'Ask' }] },
        { id: 'model', type: 'select', category: 'model', currentValue: 'auto', options: [{ value: 'auto', name: 'Auto' },
          { name: 'Frontier', options: [{ value: 'gpt-5.5', name: 'GPT-5.5' }, { value: 'auto', name: 'Auto again' }] }] }] }`;
      expect(await acpModels("cursor", AbortSignal.timeout(5000), { executable: process.execPath, args: acpServer(join(directory, "log"), session, false) })).toEqual([
        { id: "auto", name: "Auto", efforts: [] }, { id: "gpt-5.5", name: "GPT-5.5", efforts: [] },
      ]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("lists Grok models from an ACP probe's session models", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dojo-acp-models-"));
    try {
      const session = `{ sessionId: 's1', models: { currentModelId: 'fixture-first', availableModels: [{ modelId: 'fixture-first', name: 'Fixture first' }, { modelId: 'fixture-second', name: 'Fixture second' }] } }`;
      expect(await acpModels("grok", AbortSignal.timeout(5000), { executable: process.execPath, args: acpServer(join(directory, "log"), session, false) })).toEqual([
        { id: "fixture-first", name: "Fixture first", efforts: [] }, { id: "fixture-second", name: "Fixture second", efforts: [] },
      ]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("closes the probe session when the agent supports it and always stops the probe", async () => {
    // and deletes it when the agent can, so the probe leaves no session in the agent's history (open risk 3)
    const directory = await mkdtemp(join(tmpdir(), "dojo-acp-models-"));
    try {
      const session = "{ sessionId: 's1', models: { availableModels: [] } }";
      for (const [name, close] of [["closing", true], ["plain", false]] as const) {
        const log = join(directory, name);
        await acpModels("grok", AbortSignal.timeout(5000), { executable: process.execPath, args: acpServer(log, session, close) });
        const [pid, ...methods] = (await readFile(log, "utf8")).trim().split("\n");
        expect(methods).toEqual(["initialize", "session/new", ...(close ? ["session/close", "session/delete"] : [])]);
        const alive = () => { try { process.kill(Number(pid!.slice(4)), 0); return true; } catch { return false; } };
        await vi.waitFor(() => expect(alive()).toBe(false), { timeout: 5000 });
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("lists no ACP models when the CLI is missing", async () => {
    expect(await acpModels("cursor", AbortSignal.timeout(5000), { executable: "/does-not-exist/cursor-agent" })).toEqual([]);
  });
});
