import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@dojofoo/agent/client";
import { expect, it, vi } from "vitest";
// Shared deterministic HTTP fixture; it performs no external inference.
// @ts-expect-error Existing JavaScript test fixture has no declaration file.
import { startLoopbackModel } from "../../../agent/experiments/model-provider/loopback-openai.mjs";
import { createKyoshiRuntime } from "./runtime";

it.each(["runtime", "native", "grok", "fx", "codex"] as const)("asks and resumes through official authoring runtime with %s model selection", async (selection) => {
  const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-turn-"));
  const home = join(root, "home");
  await mkdir(home);
  if (selection === "codex") await mkdir(join(home, ".codex"));
  const endpoint = await startLoopbackModel({ responses: selection !== "grok", latencyMs: selection === "grok" ? 250 : 0,
    selectResponsesTool: selection === "codex" ? (request: { input?: unknown }, requested: string[]) => {
      if (requested.includes("exec_command")) return undefined;
      // The official Codex adapter supplies host tools through this CLI relay.
      // Follow its actual prompt instruction rather than invent an MCP server.
      const content = JSON.stringify(request.input);
      const command = content.match(/node ([^\s]+\/harness-tool\.mjs) <toolName>/);
      if (!command) throw new Error("Official Codex host-tool instruction missing");
      const input = JSON.stringify({ prompt: "Which learner?", options: [{ id: "beginner", label: "Beginner" }] });
      return { name: "exec_command", input: { cmd: `node ${command[1]} dojo_ui_ask '${input}'`, yield_time_ms: 1000 } };
    } : undefined,
    selectChatTool: selection === "grok" ? (request: { messages?: Array<{ role: string; content?: string }> }, requested: string[]) => {
      if (requested.length === 0) return { name: "search_tool", input: { query: "dojo_ui_ask" } };
      if (requested.includes("use_tool")) return undefined;
      const content = request.messages?.filter(message => message.role === "tool").map(message => message.content).join("\n") ?? "";
      const qualified = content.match(/[\w-]+__dojo_ui_ask/);
      if (!qualified) {
        // Grok reports partial discovery while MCP servers connect. A model
        // must query again rather than assume that an empty partial list is final.
        return content.includes('"partial"') && requested.length < 8
          ? { name: "search_tool", input: { query: "dojo_ui_ask" } } : undefined;
      }
      return { name: "use_tool", input: { tool_name: qualified[0], tool_input: {
        prompt: "Which learner?", options: [{ id: "beginner", label: "Beginner" }],
      } } };
    } : undefined, toolRequest: {
    name: "dojo_ui_ask",
    ...(selection === "fx" ? { discovery: { name: "capability_search", input: { query: "dojo_ui_ask" } } } : {}),
    input: { prompt: "Which learner?", options: [{ id: "beginner", label: "Beginner" }] },
  } });
  if (selection === "native") {
    const config = join(home, "config", "opencode");
    await mkdir(config, { recursive: true });
    await writeFile(join(config, "opencode.json"), JSON.stringify({
      model: "openai/gpt-4o",
      small_model: "openai/gpt-4o",
      enabled_providers: ["openai"],
      provider: { openai: { options: { baseURL: endpoint.baseURL, apiKey: "fixture-only" } } },
    }));
  }
  vi.stubEnv("DOJOFOO_HARNESS", selection === "runtime" || selection === "native" ? "opencode" : selection);
  // Eve intentionally substitutes mock models under NODE_ENV=test.
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("EVE_MOCK_AUTHORED_MODELS", "0");
  vi.stubEnv("HOME", home);
  if (selection === "codex") vi.stubEnv("CODEX_HOME", join(home, ".codex"));
  vi.stubEnv("XDG_CONFIG_HOME", join(home, "config"));
  vi.stubEnv("XDG_DATA_HOME", join(home, "data"));
  vi.stubEnv("XDG_CACHE_HOME", join(home, "cache"));
  vi.stubEnv("OPENAI_API_KEY", "fixture-only");
  vi.stubEnv("OPENAI_BASE_URL", endpoint.baseURL);
  vi.stubEnv("XAI_API_KEY", "fixture-only");
  vi.stubEnv("GROK_XAI_API_BASE_URL", endpoint.baseURL);
  vi.stubEnv("GROK_MODELS_BASE_URL", endpoint.baseURL);
  vi.stubEnv("GROK_HOME", join(home, ".grok"));
  vi.stubEnv("AI_GATEWAY_API_KEY", selection === "fx" ? "fixture-only" : "");
  if (selection === "fx") {
    const base = endpoint.baseURL.replace(/\/v1$/, "");
    vi.stubEnv("AI_GATEWAY_BASE_URL", base);
    vi.stubEnv("FX_GATEWAY_BASE_URL", base);
    vi.stubEnv("FX_GATEWAY_CHAT_URL", `${base}/v4/ai/language-model`);
    vi.stubEnv("FX_DISABLE_KEYCHAIN", "1");
    vi.stubEnv("FX_E2E_DISABLE_DOTENV", "1");
    vi.stubEnv("FX_AUTO_UPGRADE", "0");
  }
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  vi.stubEnv("CI", "1");
  vi.stubEnv("PATH", `${fileURLToPath(new URL("../../node_modules/.bin", import.meta.url))}:${process.env.PATH}`);
  let runtime: Awaited<ReturnType<typeof createKyoshiRuntime>> | undefined;
  try {
    runtime = await createKyoshiRuntime(root, selection === "runtime" ? { model: "openai/gpt-4o" } : {});
    const { url } = await runtime.start();
    const configuration = JSON.parse(await readFile(join(root, ".dojo/kyoshi-app/agents/kyoshi/runtime.json"), "utf8"));
    expect(configuration.model).toBe(selection === "runtime" ? "openai/gpt-4o" : undefined);
    expect(JSON.stringify(configuration)).not.toContain("fixture-only");
    const created = await new Client({ host: url }).sessions.create({
      message: "Help me author a course.", signal: AbortSignal.timeout(120_000),
    });
    const parked = await created.response.result();
    expect(parked.inputRequests, JSON.stringify({ parked, requestedTools: endpoint.requestedTools,
      searchResults: endpoint.requests.map((request: { input?: Array<{ type?: string }> }) => Array.isArray(request.input) ? request.input.filter(item => item.type === "tool_search_output" || item.type === "function_call_output") : []),
      tools: endpoint.requests.map((request: { tools?: Array<{ name?: string; function?: { name?: string } }> }) => request.tools?.map(tool => tool.name ?? tool.function?.name)),
      unnamedTools: endpoint.requests.map((request: { tools?: Array<{ name?: string; function?: { name?: string } }> }) => request.tools?.filter(tool => !tool.name && !tool.function?.name)),
      toolResults: endpoint.requests.map((request: { messages?: Array<{ role: string }> }) => request.messages?.filter(message => message.role === "tool")), paths: endpoint.paths })).toHaveLength(1);
    expect(parked.inputRequests[0].prompt).toBe("Which learner?");
    const state = created.session.state;
    await runtime.close();
    // A normal UI restart supplies no model; keep the author's previous choice.
    runtime = await createKyoshiRuntime(root);
    const restarted = await runtime.start();
    const session = new Client({ host: restarted.url }).sessions.attach(state.sessionId, { streamIndex: state.streamIndex });
    const result = await (await session.respond([{
      requestId: parked.inputRequests[0].requestId, optionId: "beginner",
    }], { signal: AbortSignal.timeout(60_000) })).result();
    expect(result.message, JSON.stringify(result)).toBe("Ready to teach.");
    if (selection === "grok") expect(endpoint.requestedTools.filter((name: string) => name === "use_tool")).toHaveLength(1);
    else if (selection === "fx") expect(endpoint.requestedTools.filter((name: string) => name.endsWith("dojo_ui_ask"))).toHaveLength(1);
    else if (selection === "codex") expect(endpoint.requestedTools).toEqual(["exec_command"]);
    else expect(endpoint.requestedTools).toHaveLength(1);
    expect(JSON.stringify(endpoint.requests)).toContain("course author's Kyoshi");
    expect(JSON.stringify(endpoint.requests)).toContain("Help me author a course.");
    expect(JSON.stringify(endpoint.requests)).toContain("beginner");
    if (selection === "runtime") {
      // Exercise the authored dynamic model resolver, not a scripted adapter.
      // Selection changes apply at the next normal native turn boundary.
      const path = join(root, ".dojo/kyoshi-app/agents/kyoshi/runtime.json");
      const live = JSON.parse(await readFile(path, "utf8"));
      await writeFile(path, JSON.stringify({ ...live, model: "openai/gpt-4.1" }));
      const continued = await (await session.send("Continue with the selected model.", {
        signal: AbortSignal.timeout(60_000),
      })).result();
      expect(continued.message).toBe("Ready to teach.");
      const switched = endpoint.requests.find((request: { model?: string }) => request.model === "gpt-4.1");
      expect(switched, "The native harness must actually request the newly selected model").toBeDefined();
      expect(JSON.stringify(switched)).toContain("Help me author a course.");
      expect(JSON.stringify(switched)).toContain("beginner");
      expect(JSON.stringify(switched)).toContain("Continue with the selected model.");
      expect(session.state.sessionId).toBe(state.sessionId);
    }
    expect((await readdir(root)).sort()).toEqual([".dojo", "home"]);
  } finally {
    await runtime?.close();
    await endpoint.close();
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}, 180_000);
