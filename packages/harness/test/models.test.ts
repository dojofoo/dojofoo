import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acpModels, codexModels, configuredHarnessEffort, configuredHarnessModel, fxModels, openCodeDefaultModel, parseFxModels, parseOpenCodeModels, piModels } from "../src/models.ts";

const createModelRuntime = vi.hoisted(() => vi.fn());
const thinkingLevels = vi.hoisted(() => vi.fn());
const storedCredential = vi.hoisted(() => vi.fn());
vi.mock("@earendil-works/pi-coding-agent", () => ({ ModelRuntime: { create: createModelRuntime }, readStoredCredential: storedCredential }));
/** A Pi model runtime holding these providers' models, of which `available` are listed as signed in */
const piRuntime = (catalog: { provider: string; id: string; name: string }[], available: string[], names: Record<string, string> = {}) => ({
  getError: () => undefined,
  getAvailableSnapshot: () => catalog.filter(model => available.includes(`${model.provider}/${model.id}`)),
  getModels: (provider: string) => catalog.filter(model => model.provider === provider),
  getProvider: (provider: string) => names[provider] ? { id: provider, name: names[provider] } : undefined,
});
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

const verboseOpenCode = `opencode/big-pickle
${JSON.stringify({ id: "big-pickle", providerID: "opencode", name: "Big Pickle", release_date: "2025-10-17", variants: {} }, null, 2)}
deepseek/deepseek-v4-pro
${JSON.stringify({ id: "deepseek-v4-pro", providerID: "deepseek", name: "DeepSeek V4 Pro", release_date: "2026-08-01", variants: { low: {}, high: {}, max: {} } }, null, 2)}
`;

describe("native model discovery", () => {
  it("uses Codex's configured model without confusing nested TOML settings with the root model", async () => {
    const home = await mkdtemp(join(tmpdir(), "dojo-codex-config-"));
    try {
      expect(await configuredHarnessModel("codex", home)).toBeUndefined();
      await writeFile(join(home, "config.toml"), `model = 'configured-model' # native choice\n[profiles.other]\nmodel = "other-model"\n`);
      expect(await configuredHarnessModel("codex", home)).toBe("configured-model");
      expect(await configuredHarnessModel("claude", home)).toBeUndefined();
    } finally { await rm(home, { recursive: true, force: true }); }
  });
  it("starts a conversation at the effort the agent is configured with: Codex's, and Pi's while the model takes it", async () => {
    const home = await mkdtemp(join(tmpdir(), "dojo-effort-config-"));
    const listed = [{ id: "zai/glm-5.3-flash", name: "GLM-5.3-Flash", efforts: ["off", "low", "high"] }, { id: "zai/plain", name: "Plain", efforts: [] }];
    try {
      expect(await configuredHarnessEffort("codex", "gpt-6.1-sol", home)).toBeUndefined();
      await writeFile(join(home, "config.toml"), `model = "gpt-6.1-sol"\nmodel_reasoning_effort = "medium"\n`);
      expect(await configuredHarnessEffort("codex", "gpt-6.1-sol", home)).toBe("medium");
      await writeFile(join(home, "settings.json"), JSON.stringify({ defaultThinkingLevel: "high" }));
      expect(await configuredHarnessEffort("pi", "zai/glm-5.3-flash", undefined, { piAgentDir: home, listPi: async () => listed })).toBe("high");
      expect(await configuredHarnessEffort("pi", "zai/plain", undefined, { piAgentDir: home, listPi: async () => listed })).toBeUndefined();
      expect(await configuredHarnessEffort("opencode", "deepseek/deepseek-v4-pro", home)).toBeUndefined();
    } finally { await rm(home, { recursive: true, force: true }); }
  });
  it("starts FX on the first model its CLI lists, and on libfx's own default when the CLI lists none or fails", async () => {
    const listed = [{ id: "gpt-6.1-sol", name: "gpt-6.1-sol", efforts: [] }, { id: "gpt-6-luna", name: "gpt-6-luna", efforts: [] }];
    expect(await configuredHarnessModel("fx", undefined, async () => listed)).toBe("gpt-6.1-sol");
    expect(await configuredHarnessModel("fx", undefined, async () => [])).toBeUndefined();
    expect(await configuredHarnessModel("fx", undefined, async () => { throw new Error("FX returned an invalid model catalog"); })).toBeUndefined();
  });
  it("uses Pi's configured availability without exposing credentials or inventing effort support", async () => {
    thinkingLevels.mockReturnValueOnce(["off", "high"]);
    const model = { provider: "custom", id: "reasoner", name: "Local reasoner", reasoning: true, apiKey: "private" };
    createModelRuntime.mockResolvedValueOnce(piRuntime([model], ["custom/reasoner"]));
    storedCredential.mockReturnValue(undefined);
    const signal = AbortSignal.timeout(2000);
    expect(await piModels(signal, "/fixture/pi")).toEqual([{ id: "custom/reasoner", name: "Local reasoner", description: "custom", efforts: ["off", "high"] }]);
    expect(thinkingLevels).toHaveBeenLastCalledWith(model);
    expect(createModelRuntime).toHaveBeenLastCalledWith({ authPath: "/fixture/pi/auth.json", modelsPath: "/fixture/pi/models.json", allowModelNetwork: false, signal });
  });
  it("lists Pi's models a turn can't run with what to do: an expired sign-in, and models outside the plan", async () => {
    thinkingLevels.mockReturnValue([]);
    const now = Date.parse("2026-11-08T10:00:00Z");
    createModelRuntime.mockResolvedValueOnce(piRuntime([
      { provider: "zai", id: "glm-5.3", name: "GLM-5.3" },
      { provider: "openai-codex", id: "gpt-6.1-sol", name: "GPT-6.1 Sol" },
      { provider: "github-copilot", id: "claude-sonnet-5", name: "Claude Sonnet 5" },
      { provider: "github-copilot", id: "gpt-6-astra", name: "GPT-6 Astra" },
    ], ["zai/glm-5.3", "openai-codex/gpt-6.1-sol", "github-copilot/claude-sonnet-5"], { zai: "Z.ai", "openai-codex": "ChatGPT", "github-copilot": "GitHub Copilot" }));
    storedCredential.mockImplementation((provider: string) => ({
      zai: { type: "api_key", key: "private" },
      "openai-codex": { type: "oauth", access: "private", refresh: "private", expires: Date.parse("2026-04-23T08:32:28Z") },
      // Pi renews a login five minutes before it ends, which a read-only turn can't
      "github-copilot": { type: "oauth", access: "private", refresh: "private", expires: now + 60_000 },
    })[provider]);
    expect(await piModels(AbortSignal.timeout(2000), "/fixture/pi", now)).toEqual([
      { id: "zai/glm-5.3", name: "GLM-5.3", description: "Z.ai", efforts: [] },
      { id: "openai-codex/gpt-6.1-sol", name: "GPT-6.1 Sol", description: "ChatGPT", efforts: [], unavailable: "Sign in to ChatGPT again",
        signIn: "openai-codex" },
      { id: "github-copilot/claude-sonnet-5", name: "Claude Sonnet 5", description: "GitHub Copilot", efforts: [], unavailable: "Sign in to GitHub Copilot again",
        signIn: "github-copilot" },
      { id: "github-copilot/gpt-6-astra", name: "GPT-6 Astra", description: "GitHub Copilot", efforts: [], unavailable: "Not in your GitHub Copilot plan" },
    ]);
  });
  it("starts Sensei's Pi on the user's default model while it can run, else on the first that can", async () => {
    const agentDir = await mkdtemp(join(tmpdir(), "dojo-pi-settings-"));
    const listed = [
      { id: "openai-codex/gpt-6.1-sol", name: "GPT-6.1 Sol", efforts: [], unavailable: "Sign in to ChatGPT again" },
      { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", efforts: [] },
      { id: "zai/glm-5.3-flash", name: "GLM-5.3-Flash", efforts: [] },
    ];
    try {
      expect(await configuredHarnessModel("pi", undefined, undefined, { piAgentDir: agentDir, listPi: async () => listed })).toBe("deepseek/deepseek-v4-pro");
      await writeFile(join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: "zai", defaultModel: "glm-5.3-flash" }));
      expect(await configuredHarnessModel("pi", undefined, undefined, { piAgentDir: agentDir, listPi: async () => listed })).toBe("zai/glm-5.3-flash");
      await writeFile(join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: "openai-codex", defaultModel: "gpt-6.1-sol" }));
      expect(await configuredHarnessModel("pi", undefined, undefined, { piAgentDir: agentDir, listPi: async () => listed })).toBe("deepseek/deepseek-v4-pro");
    } finally { await rm(agentDir, { recursive: true, force: true }); }
  });
  it("starts Sensei's OpenCode on the model OpenCode picks itself: its server's default for its first provider", async () => {
    const folder = await mkdtemp(join(tmpdir(), "dojo-opencode-serve-"));
    const executable = join(folder, "opencode");
    // An OpenCode whose server answers /config/providers as OpenCode 1.18 does
    await writeFile(executable, `#!/usr/bin/env node
const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
require("node:http").createServer((request, response) => response.end(JSON.stringify({
  providers: [{ id: "deepseek" }, { id: "opencode" }], default: { deepseek: "deepseek-v4-pro", opencode: "big-pickle" } }))).listen(port, "127.0.0.1");
`, { mode: 0o755 });
    try {
      expect(await openCodeDefaultModel(AbortSignal.timeout(10_000), { executable, environment: { PATH: process.env.PATH } })).toBe("deepseek/deepseek-v4-pro");
      expect(await configuredHarnessModel("opencode", undefined, undefined, { openCodeDefault: async () => { throw new Error("OpenCode is missing"); } })).toBeUndefined();
    } finally { await rm(folder, { recursive: true, force: true }); }
  });
  it("surfaces Pi configuration failures", async () => {
    createModelRuntime.mockResolvedValueOnce({ getError: () => "Invalid provider configuration" });
    await expect(piModels(AbortSignal.timeout(2000), "/fixture/pi")).rejects.toThrow("Invalid provider configuration");
  });
  it("reads OpenCode's model names and reasoning variants", () => {
    expect(parseOpenCodeModels(verboseOpenCode)).toEqual([
      { id: "opencode/big-pickle", name: "Big Pickle", description: "opencode", efforts: [] },
      { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", description: "deepseek", efforts: ["low", "high", "max"] },
    ]);
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
        data: [{ model: 'first', displayName: 'First', supportedReasoningEfforts: [{ reasoningEffort: 'high' }], defaultReasoningEffort: 'high', isDefault: true }], nextCursor: 'page2'
      }
    `));
    expect(models).toEqual([
      { id: "first", name: "First", efforts: ["high"], defaultEffort: "high", default: true },
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
