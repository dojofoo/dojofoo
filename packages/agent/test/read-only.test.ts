import { claudeCode } from "@ai-sdk/harness-claude-code";
import { codex } from "@ai-sdk/harness-codex";
import { cursor } from "@ai-sdk/harness-cursor";
import { fx } from "@ai-sdk/harness-fx";
import { grokBuild } from "@ai-sdk/harness-grok-build";
import { openCode } from "@ai-sdk/harness-opencode";
import { pi } from "@ai-sdk/harness-pi";
import { agentRow, type AgentId } from "@dojofoo/protocol";
import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { experimental_createHarnessModel, PreventionError, type PreventionRecord } from "../src/harness-model.ts";
import {
  approvesHostTool, readOnlyAdapterSettings, readOnlyEnvironment, readOnlyToolNames, removeReadOnlyHome, withoutBuiltinFiltering,
} from "../src/read-only.ts";
import { fakeHarness, fakeSandbox, reply, userPrompt } from "./fake-harness.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const temporary = async () => { const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-read-only-"))); roots.push(root); return root; };
const eveTool = (name: string) => ({ type: "function" as const, name, description: name, inputSchema: { type: "object" as const, properties: {} } });
const claudeBuiltins = { read: "Read", write: "Write", bash: "Bash" };
const grokBuiltins = { read_file: "read_file", list_dir: "list_dir", grep: "grep", search_tool: "search_tool", use_tool: "use_tool", write: "write" };
type Model = ReturnType<typeof experimental_createHarnessModel>["model"];
const textOf = (result: Awaited<ReturnType<Model["doGenerate"]>>) => result.content.flatMap(part => part.type === "text" ? [part.text] : []).join("");

describe("read-only harness model", () => {
  it("a read-only call allows only the row's built-ins plus that call's Eve tools", async () => {
    const native = fakeHarness({ builtins: claudeBuiltins });
    const { model } = experimental_createHarnessModel({ harness: native.harness, sandbox: fakeSandbox() }, { mode: "read-only", agent: "claude" });
    const result = await model.doGenerate({ prompt: userPrompt("Begin."), tools: [eveTool("ask_question"), eveTool("dojo_context")] });
    expect(textOf(result)).toBe("Ready to teach.");
    expect(native.starts[0]).toMatchObject({ permissionMode: "allow-reads", builtinToolFiltering: { mode: "allow", toolNames: ["read"] } });
  });

  it("a missing mode is read-only and needs an agent", async () => {
    const native = fakeHarness({ builtins: claudeBuiltins });
    expect(() => experimental_createHarnessModel({ harness: native.harness, sandbox: fakeSandbox() })).toThrow("A read-only harness model needs its coding agent.");
    const { model } = experimental_createHarnessModel({ harness: native.harness, sandbox: fakeSandbox() }, { agent: "claude" });
    await model.doGenerate({ prompt: userPrompt("Begin.") });
    expect(native.starts[0]).toMatchObject({ permissionMode: "allow-reads", builtinToolFiltering: { mode: "allow", toolNames: ["read"] } });
  });

  it("full mode passes no filter and no permission mode", async () => {
    const native = fakeHarness({ builtins: claudeBuiltins });
    const { model } = experimental_createHarnessModel({ harness: native.harness, sandbox: fakeSandbox() }, { mode: "full" });
    await model.doGenerate({ prompt: userPrompt("Begin."), tools: [eveTool("dojo_context")] });
    expect(native.starts[0]?.builtinToolFiltering).toBeUndefined();
    expect(native.starts[0]?.permissionMode ?? "allow-all").toBe("allow-all");
  });

  it("compaction uses the same allow-list and permission mode", async () => {
    const native = fakeHarness({ builtins: claudeBuiltins });
    const { model } = experimental_createHarnessModel({ harness: native.harness, sandbox: fakeSandbox() }, { mode: "read-only", agent: "claude" });
    const first = await model.doGenerate({ prompt: userPrompt("Begin."), tools: [eveTool("dojo_context")] });
    const text = first.content.find(part => part.type === "text")!;
    const messages = [{ role: "user" as const, content: "Begin." },
      { role: "assistant" as const, content: [{ type: "text" as const, text: textOf(first), providerOptions: (text as { providerMetadata?: never }).providerMetadata }] }];
    await model.experimental_compact({ messages });
    expect(native.compactions).toHaveLength(1);
    expect(native.starts[1]).toMatchObject({ permissionMode: "allow-reads", builtinToolFiltering: { mode: "allow", toolNames: ["read"] } });
  });

  it("an approval request in read-only mode ends the turn with PreventionError and records it", async () => {
    // HarnessAgent itself denies approvals for built-ins outside the allow-list; one for an allowed relay that targets another tool reaches the model
    const native = fakeHarness({ builtins: grokBuiltins, script: ({ emit }) => {
      emit({ type: "tool-call", toolCallId: "write-1", toolName: "use_tool", input: JSON.stringify({ tool_name: "dojo-seeded__dojo_seeded_write", tool_input: {} }), providerExecuted: true, dynamic: true });
      emit({ type: "tool-approval-request", approvalId: "approval-1", toolCallId: "write-1" });
      emit({ type: "finish-step", finishReason: { unified: "tool-calls" }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } } });
    } });
    const records: PreventionRecord[] = [];
    const { model } = experimental_createHarnessModel({ harness: native.harness, sandbox: fakeSandbox() },
      { mode: "read-only", agent: "grok", eveSessionId: "eve-1", onPrevention: record => records.push(record) });
    const failure = await model.doGenerate({ prompt: userPrompt("Write a file."), tools: [eveTool("dojo_context")] }).catch(error => error);
    expect(failure).toBeInstanceOf(PreventionError);
    expect(failure).not.toHaveProperty("statusCode");
    expect(records).toEqual([expect.objectContaining({ type: "dojofoo.prevention", kind: "approval-refused", agent: "grok", tool: "use_tool", eveSessionId: "eve-1" })]);
    expect(native.approvals).toEqual([]);
  });

  it("an approval for a built-in outside the allow-list never reaches the model", async () => {
    const native = fakeHarness({ builtins: claudeBuiltins, script: ({ emit }) => {
      emit({ type: "tool-call", toolCallId: "write-1", toolName: "write", input: "{}", providerExecuted: true, dynamic: true });
      emit({ type: "tool-approval-request", approvalId: "approval-1", toolCallId: "write-1" });
      emit({ type: "finish-step", finishReason: { unified: "tool-calls" }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } } });
    } });
    const records: PreventionRecord[] = [];
    const { model } = experimental_createHarnessModel({ harness: native.harness, sandbox: fakeSandbox() },
      { mode: "read-only", agent: "claude", onPrevention: record => records.push(record) });
    const result = await model.doGenerate({ prompt: userPrompt("Write a file."), tools: [eveTool("dojo_context")] });
    expect(native.approvals).toEqual([expect.objectContaining({ approvalId: "approval-1", approved: false })]);
    expect(result.content.some(part => part.type === "tool-approval-request")).toBe(false);
    expect(records).toEqual([expect.objectContaining({ kind: "native-call-outside-allow-list", tool: "write", failed: true })]);
  });

  it("an approval for one of the call's Eve tools, including Grok's use_tool, is approved without a card", async () => {
    const native = fakeHarness({
      builtins: grokBuiltins,
      script: ({ emit }) => {
        emit({ type: "tool-call", toolCallId: "relay-1", toolName: "use_tool", input: JSON.stringify({ tool_name: "harness-tools__dojo_context", tool_input: {} }), providerExecuted: true, dynamic: true });
        emit({ type: "tool-approval-request", approvalId: "approval-1", toolCallId: "relay-1" });
        emit({ type: "finish-step", finishReason: { unified: "tool-calls" }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } } });
        return { approve: (answer, next) => {
          next({ type: "tool-result", toolCallId: "relay-1", toolName: "use_tool", result: "context", dynamic: true });
          reply(next, answer.approved ? "Ready to teach." : "Refused.");
        } };
      },
    });
    const records: PreventionRecord[] = [];
    const { model } = experimental_createHarnessModel({ harness: native.harness, sandbox: fakeSandbox() },
      { mode: "read-only", agent: "grok", onPrevention: record => records.push(record) });
    const result = await model.doGenerate({ prompt: userPrompt("Begin."), tools: [eveTool("dojo_context")] });
    expect(textOf(result)).toBe("Ready to teach.");
    expect(result.content.some(part => part.type === "tool-approval-request")).toBe(false);
    expect(native.approvals).toEqual([{ approvalId: "approval-1", approved: true }]);
    expect(records).toEqual([]);
    expect(approvesHostTool("grok", { toolName: "use_tool", input: { tool_name: "harness-tools__dojo_context" } }, ["dojo_context"])).toBe(true);
    expect(approvesHostTool("grok", { toolName: "use_tool", input: { tool_name: "harness-tools__write" } }, ["dojo_context"])).toBe(false);
    expect(approvesHostTool("claude", { toolName: "mcp__harness-tools__dojo_context", input: {} }, ["dojo_context"])).toBe(true);
    expect(approvesHostTool("claude", { toolName: "Write", input: {} }, ["dojo_context"])).toBe(false);
  });

  it("native names map per agent (Read, read_file, mcp__harness-tools__x, harness-tools_x)", () => {
    expect(readOnlyToolNames("claude", ["dojo_context"])).toEqual({ keys: ["read", "dojo_context"], native: ["Read", "mcp__harness-tools__dojo_context"] });
    expect(readOnlyToolNames("grok", ["dojo_context"]).native).toEqual(["read_file", "list_dir", "grep", "search_tool", "use_tool"]);
    expect(readOnlyToolNames("grok", ["dojo_context"]).keys).toEqual(["read_file", "list_dir", "grep", "search_tool", "use_tool", "dojo_context"]);
    expect(readOnlyToolNames("opencode", ["dojo_context"]).native).toContain("harness-tools_dojo_context");
    expect(readOnlyToolNames("codex", ["dojo_context"])).toEqual({ keys: ["dojo_context"], native: ["dojo_context"] });
    // The table agrees with the adapters' own builtinTools metadata at the pinned versions
    const adapters: Partial<Record<AgentId, { builtinTools: Record<string, { nativeName?: string }> }>> = {
      claude: claudeCode, codex, cursor, fx, grok: grokBuild, opencode: openCode, pi,
    };
    for (const [agent, adapter] of Object.entries(adapters) as Array<[AgentId, { builtinTools: Record<string, { nativeName?: string }> }]>) {
      const { native } = readOnlyToolNames(agent, []);
      for (const key of agentRow(agent).readOnly!.builtinTools) {
        expect(adapter.builtinTools, `${agent} ${key}`).toHaveProperty(key);
        expect(native, `${agent} ${key}`).toContain(adapter.builtinTools[key]!.nativeName ?? key);
      }
    }
  });

  it("a deny row's adapter never receives builtinToolFiltering, on start, resume and continue", async () => {
    const native = fakeHarness({
      builtins: grokBuiltins,
      script: ({ prompt, emit }) => {
        if (prompt !== "Use the tool.") return reply(emit, "Ready to teach.");
        emit({ type: "tool-call", toolCallId: "context-1", toolName: "dojo_context", input: "{}" });
        emit({ type: "finish-step", finishReason: { unified: "tool-calls" }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } } });
      },
    });
    const { model } = experimental_createHarnessModel({ harness: withoutBuiltinFiltering(native.harness), sandbox: fakeSandbox() }, { mode: "read-only", agent: "grok" });
    const tools = [eveTool("dojo_context")];
    const first = await model.doGenerate({ prompt: userPrompt("Begin."), tools });
    const text = first.content.find(part => part.type === "text") as { providerMetadata?: never };
    const resumed = await model.doGenerate({ tools, prompt: [...userPrompt("Begin."),
      { role: "assistant", content: [{ type: "text", text: textOf(first), providerOptions: text.providerMetadata }] }, ...userPrompt("Use the tool.")] });
    const call = resumed.content.find(part => part.type === "tool-call") as { toolCallId: string; toolName: string; input: string; providerMetadata?: never };
    expect(call?.toolName).toBe("dojo_context");
    const continued = await model.doGenerate({ tools, prompt: [...userPrompt("Use the tool."),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: call.toolCallId, toolName: call.toolName, input: JSON.parse(call.input), providerOptions: call.providerMetadata }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: call.toolCallId, toolName: call.toolName, output: { type: "json", value: { ok: true } } }] }] });
    expect(textOf(continued)).toBe("Ready to teach.");
    expect(native.starts).toHaveLength(3);
    expect(native.starts.map(start => Boolean(start.resumeFrom || start.continueFrom))).toEqual([false, true, true]);
    for (const start of native.starts) expect(start.builtinToolFiltering).toBeUndefined();
  });
});

describe("read-only isolation", () => {
  it("Grok gets one private home per Eve session, holding only the model tables of the user's config.toml", async () => {
    const root = await temporary();
    const user = join(root, "user");
    await mkdir(join(user, ".grok/bin"), { recursive: true });
    await mkdir(join(user, ".ai-sdk-harness"), { recursive: true });
    await writeFile(join(user, ".grok/config.toml"), [
      'theme = "dark"', "[models]", 'default = "fixture-first"', "[model.fixture-first]", 'model = "fixture-first"',
      "[mcp_servers.seeded]", 'command = "node"', "[model.fixture-second]", 'model = "fixture-second"', "[[hooks]]", 'command = "x"',
    ].join("\n"));
    const state = join(root, "state");
    const first = await readOnlyEnvironment("grok", { HOME: user, PATH: "/bin" }, { stateDirectory: state, eveSessionId: "eve-1" });
    const second = await readOnlyEnvironment("grok", { HOME: user, PATH: "/bin" }, { stateDirectory: state, eveSessionId: "eve-2" });
    expect(first.HOME).toBe(join(state, "read-only-homes/grok/sessions/eve-1"));
    expect(second.HOME).not.toBe(first.HOME);
    expect(first.GROK_HOME).toBe(join(first.HOME!, ".grok"));
    expect(first).toMatchObject({ GROK_CLAUDE_MCPS_ENABLED: "false", GROK_MANAGED_MCPS_ENABLED: "false", GROK_DISABLE_AUTOUPDATER: "1", PATH: "/bin" });
    const config = await readFile(join(first.HOME!, ".grok/config.toml"), "utf8");
    expect(config).toContain("[models]");
    expect(config).toContain("[model.fixture-first]");
    expect(config).toContain("[model.fixture-second]");
    expect(config).not.toContain("mcp_servers");
    expect(config).not.toContain("theme");
    expect(config).not.toContain("hooks");
    expect(readlinkSync(join(first.HOME!, ".grok/bin"))).toBe(join(user, ".grok/bin"));
    await expect(readOnlyEnvironment("grok", { HOME: user }, { stateDirectory: state })).rejects.toThrow("needs its Eve session id");
    await removeReadOnlyHome("grok", { stateDirectory: state, eveSessionId: "eve-1" });
    expect(existsSync(first.HOME!)).toBe(false);
    expect(existsSync(second.HOME!)).toBe(true);
  });

  it("Pi's read-only settings carry the user's providers and credentials, not its agentDir", async () => {
    const agentDir = await temporary();
    const providers = { fixture: { baseUrl: "http://127.0.0.1:1/v1", api: "openai-completions", models: [{ id: "fixture-model" }] } };
    await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers }));
    await writeFile(join(agentDir, "auth.json"), JSON.stringify({ openai: { type: "api_key", key: "fixture-only" } }));
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ packages: ["npm:dojo-seeded"] }));
    const settings = await readOnlyAdapterSettings("pi", { PI_CODING_AGENT_DIR: agentDir });
    expect(settings).not.toHaveProperty("agentDir");
    expect(settings.providers).toEqual(providers);
    const credentials = settings.credentials as { read(id: string): Promise<unknown>; list(): Promise<unknown>; modify(id: string, fn: unknown): Promise<unknown> };
    expect(await credentials.read("openai")).toEqual({ type: "api_key", key: "fixture-only" });
    expect(await credentials.list()).toEqual([{ providerId: "openai", type: "api_key" }]);
    await expect(credentials.modify("openai", async () => undefined)).rejects.toThrow("cannot modify auth.json");
  });

  it("the read-only environment links the bootstrap, skips missing link targets, writes Codex's config and removes OpenCode's config variables", async () => {
    const root = await temporary();
    const user = join(root, "user");
    await mkdir(join(user, ".ai-sdk-harness"), { recursive: true });
    const state = join(root, "state");
    const codexEnvironment = await readOnlyEnvironment("codex", { HOME: user }, { stateDirectory: state });
    const home = join(state, "read-only-homes/codex");
    expect(codexEnvironment).toMatchObject({ HOME: home, CODEX_HOME: join(home, ".codex") });
    expect(lstatSync(join(home, ".ai-sdk-harness")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(home, ".ai-sdk-harness"))).toBe(join(user, ".ai-sdk-harness"));
    // No auth.json for the user (tier A authenticates by key), so no link
    expect(existsSync(join(home, ".codex/auth.json"))).toBe(false);
    const config = await readFile(join(home, ".codex/config.toml"), "utf8");
    expect(config).toContain('web_search = "disabled"');
    expect(config).toContain("shell_tool = false");
    expect(config).toContain("project_doc_max_bytes = 0");
    const openCode = await readOnlyEnvironment("opencode", { HOME: user, OPENCODE_CONFIG: "/x.json", OPENCODE_CONFIG_DIR: "/x" }, { stateDirectory: state });
    expect(openCode).not.toHaveProperty("OPENCODE_CONFIG");
    expect(openCode).not.toHaveProperty("OPENCODE_CONFIG_DIR");
    expect(openCode).toMatchObject({ OPENCODE_DISABLE_PROJECT_CONFIG: "1", OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", XDG_CONFIG_HOME: join(state, "read-only-homes/opencode/.config") });
    expect(JSON.parse(openCode.OPENCODE_PERMISSION!)).toEqual({ websearch: "deny", webfetch: "deny", skill: "deny" });
    // Claude Code and FX need no private home
    const claude = await readOnlyEnvironment("claude", { HOME: user }, { stateDirectory: state });
    expect(claude).toMatchObject({ HOME: user, CLAUDE_CODE_SAFE_MODE: "1", ENABLE_CLAUDEAI_MCP_SERVERS: "false" });
    expect(existsSync(join(state, "read-only-homes/claude"))).toBe(false);
  });

  it("placeholders resolve from the user's environment, not the private home", async () => {
    const root = await temporary();
    const user = join(root, "user");
    const codexHome = join(root, "codex-home");
    await mkdir(codexHome, { recursive: true });
    await writeFile(join(codexHome, "auth.json"), "{}");
    const state = join(root, "state");
    const codexEnvironment = await readOnlyEnvironment("codex", { HOME: user, CODEX_HOME: codexHome }, { stateDirectory: state });
    expect(readlinkSync(join(codexEnvironment.CODEX_HOME!, "auth.json"))).toBe(join(codexHome, "auth.json"));
    const openCode = await readOnlyEnvironment("opencode", { HOME: user }, { stateDirectory: state });
    expect(openCode.XDG_DATA_HOME).toBe(join(user, ".local/share"));
    const custom = await readOnlyEnvironment("opencode", { HOME: user, XDG_DATA_HOME: join(root, "data") }, { stateDirectory: state });
    expect(custom.XDG_DATA_HOME).toBe(join(root, "data"));
  });
});
