import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createClaudeCode } from "@ai-sdk/harness-claude-code";
import { createCodex } from "@ai-sdk/harness-codex";
import { createFx } from "@ai-sdk/harness-fx";
import { createGrokBuild } from "@ai-sdk/harness-grok-build";
import { createOpenCode } from "@ai-sdk/harness-opencode";
import { createPi } from "@ai-sdk/harness-pi";
import { experimental_createHarnessModel, type PreventionRecord } from "@dojofoo/agent/experimental";
import { createLocalHarnessSandbox } from "@dojofoo/agent/experimental/local";
import { readOnlyAdapterSettings, readOnlyEnvironment, readOnlyToolNames, withoutBuiltinFiltering } from "@dojofoo/agent/read-only";
import { agentRow, type ResumeFailure } from "@dojofoo/protocol";
import { expect } from "vitest";
// Shared deterministic HTTP fixture; it performs no external inference.
// @ts-expect-error Shared JavaScript inference fixture has no declarations.
import { startLoopbackModel } from "../../../agent/experiments/model-provider/loopback-openai.mjs";
// @ts-expect-error The conformance scripts are plain JavaScript without declarations.
import { agentHome, caseBaseEnvironment, conformancePaths } from "../../scripts/conformance-install.mjs";

export { caseBaseEnvironment };
export type TierAAgent = "claude" | "codex" | "grok" | "opencode" | "fx" | "pi";

export interface LoopbackEndpoint {
  requests: unknown[];
  requestedModels: Array<string | undefined>;
  requestedTools: string[];
  toolLists: string[][];
  routes: string[];
  paths: string[];
  baseURL: string;
  anthropicBaseURL: string;
  holdNextResponse(matches?: (request: unknown) => boolean): { started: Promise<void>; closed: Promise<void>; release(): void };
  close(): Promise<void>;
}
export interface ToolRequest { name: string; input: unknown }
type Auth = Record<string, string>;

const authoring = fileURLToPath(new URL("../..", import.meta.url));
const gatewayBase = (endpoint: LoopbackEndpoint) => endpoint.baseURL.replace(/\/v1$/u, "");
const openai = (endpoint: LoopbackEndpoint): Auth => ({ OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: endpoint.baseURL });

/** Grok searches for a deferred tool, then calls it through use_tool (as runtime-turn.test.ts). */
function grokSelect({ name, input }: ToolRequest) {
  return (request: { messages?: Array<{ role: string; content?: string }> }, requested: string[]) => {
    if (requested.length === 0) return { name: "search_tool", input: { query: name } };
    if (requested.includes("use_tool")) return undefined;
    const content = request.messages?.filter(message => message.role === "tool").map(message => message.content).join("\n") ?? "";
    const qualified = content.match(new RegExp(`[\\w-]+__${name}`, "u"));
    // Grok reports partial discovery while MCP servers connect; query again rather than give up.
    if (!qualified) return content.includes('"partial"') && requested.length < 8 ? { name: "search_tool", input: { query: name } } : undefined;
    return { name: "use_tool", input: { tool_name: qualified[0], tool_input: input } };
  };
}

type Adapter = ReturnType<typeof createClaudeCode | typeof createCodex | typeof createFx | typeof createGrokBuild | typeof createOpenCode | typeof createPi>;
export interface AgentWiring {
  /** The harness-level adapter, configured the way Kyoshi's model is apart from its auth. */
  adapter(endpoint: LoopbackEndpoint, home: string): Adapter;
  /** The read-only adapter, as agentAdapter(…, { mode: "read-only" }) builds it, with the fixture's auth (Pi without agentDir). */
  readOnly(endpoint: LoopbackEndpoint, settings: Record<string, unknown>): Adapter;
  /** The adapter's fixture credentials; the host child gets them as environment variables. */
  auth(endpoint: LoopbackEndpoint): Auth;
  /** Environment beyond HOME and PATH, for harness-level sandboxes and the host child alike. */
  environment(home: string, endpoint: LoopbackEndpoint): Auth;
  prepareHome(home: string, endpoint: LoopbackEndpoint): Promise<void>;
  loopback(toolRequest?: ToolRequest): Record<string, unknown>;
  firstModel?: string;
  firstWire?: RegExp;
  secondModel: { selection: string; wire: RegExp };
  hostModel?: string;
  /** Out-of-process agents run a native child; FX and Pi run inside the test process. */
  outOfProcess: boolean;
  /** "native": compact() resolves after a model request; "accepted": it resolves without one; "unsupported": it rejects. */
  compaction: "native" | "accepted" | "unsupported";
  /** Whether the loopback called the host's question tool exactly once (as runtime-turn.test.ts:124-130). */
  askedOnce(requestedTools: string[]): boolean;
}

const onceEndingWith = (suffix: string) => (requestedTools: string[]) => requestedTools.filter(name => name.endsWith(suffix)).length === 1;

export const wiring: Record<TierAAgent, AgentWiring> = {
  claude: {
    adapter: endpoint => createClaudeCode({ port: 0, auth: { ANTHROPIC_API_KEY: "fixture-only", ANTHROPIC_BASE_URL: endpoint.anthropicBaseURL } }),
    readOnly: (endpoint, settings) => createClaudeCode({ port: 0, ...settings, auth: { ANTHROPIC_API_KEY: "fixture-only", ANTHROPIC_BASE_URL: endpoint.anthropicBaseURL } }),
    // In the host child agentAdapter auto-detects from the environment, where either gateway variable would win.
    auth: endpoint => ({ ANTHROPIC_API_KEY: "fixture-only", ANTHROPIC_BASE_URL: endpoint.anthropicBaseURL, AI_GATEWAY_API_KEY: "", VERCEL_OIDC_TOKEN: "" }),
    environment: () => ({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_AUTOUPDATER: "1" }),
    prepareHome: async () => {},
    // The Claude Code spike (claude-spike.md): the host tool is offered directly as mcp__harness-tools__<name>.
    loopback: toolRequest => (toolRequest ? { toolRequest } : {}),
    firstModel: "sonnet", firstWire: /sonnet/u,
    secondModel: { selection: "opus", wire: /opus/u },
    outOfProcess: true,
    compaction: "accepted",
    askedOnce: onceEndingWith("dojo_ui_ask"),
  },
  codex: {
    adapter: endpoint => createCodex({ port: 0, auth: openai(endpoint) }),
    readOnly: (endpoint, settings) => createCodex({ port: 0, ...settings, auth: openai(endpoint) }),
    auth: openai,
    environment: home => ({ CODEX_HOME: join(home, ".codex") }),
    prepareHome: async home => { await mkdir(join(home, ".codex"), { recursive: true }); },
    loopback: toolRequest => (toolRequest ? { toolRequest } : {}),
    secondModel: { selection: "gpt-5.4", wire: /^gpt-5\.4$/u },
    outOfProcess: true,
    compaction: "unsupported",
    askedOnce: requestedTools => requestedTools.length === 1 && requestedTools[0] === "dojo_ui_ask",
  },
  grok: {
    adapter: endpoint => createGrokBuild({ port: 0, auth: { XAI_API_KEY: "fixture-only", GROK_XAI_API_BASE_URL: endpoint.baseURL, GROK_MODELS_BASE_URL: endpoint.baseURL } }),
    readOnly: (endpoint, settings) => createGrokBuild({ port: 0, ...settings, auth: { XAI_API_KEY: "fixture-only", GROK_XAI_API_BASE_URL: endpoint.baseURL, GROK_MODELS_BASE_URL: endpoint.baseURL } }),
    auth: endpoint => ({ XAI_API_KEY: "fixture-only", GROK_XAI_API_BASE_URL: endpoint.baseURL, GROK_MODELS_BASE_URL: endpoint.baseURL }),
    // Grok updates its own binary in GROK_HOME/bin unless told not to; tier A must run the adapter's pin.
    environment: home => ({ GROK_HOME: join(home, ".grok"), GROK_DISABLE_AUTOUPDATER: "1" }),
    // Native custom models, so nothing relies on a remote catalog or the CLI's built-in model names.
    prepareHome: async (home, endpoint) => {
      await writeFile(join(home, ".grok/config.toml"), [
        "[models]", 'default = "fixture-first"',
        ...["first", "second"].flatMap(name => [
          `[model.fixture-${name}]`, `model = "fixture-${name}"`,
          `base_url = "${endpoint.baseURL}"`, `name = "Fixture ${name}"`,
          'api_backend = "chat_completions"', 'env_key = "XAI_API_KEY"',
        ]),
      ].join("\n"));
    },
    loopback: toolRequest => ({ responses: false, latencyMs: 250, ...(toolRequest ? { toolRequest, selectChatTool: grokSelect(toolRequest) } : {}) }),
    firstModel: "fixture-first", firstWire: /^fixture-first$/u,
    secondModel: { selection: "fixture-second", wire: /^fixture-second$/u },
    outOfProcess: true,
    compaction: "unsupported",
    askedOnce: requestedTools => requestedTools.filter(name => name === "use_tool").length === 1,
  },
  opencode: {
    adapter: endpoint => createOpenCode({ port: 0, auth: openai(endpoint), provider: "openai",
      openCodeConfig: { small_model: "openai/gpt-4o", enabled_providers: ["openai"] } }),
    readOnly: (endpoint, settings) => createOpenCode({ port: 0, ...settings, auth: openai(endpoint), provider: "openai",
      openCodeConfig: { small_model: "openai/gpt-4o", enabled_providers: ["openai"] } }),
    auth: openai,
    environment: home => ({ XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local/share"), XDG_CACHE_HOME: join(home, ".cache") }),
    prepareHome: async home => {
      for (const directory of [".config", ".local/share", ".cache"]) await mkdir(join(home, directory), { recursive: true });
    },
    loopback: toolRequest => (toolRequest ? { toolRequest } : {}),
    firstModel: "openai/gpt-4o", firstWire: /^gpt-4o$/u,
    secondModel: { selection: "openai/gpt-4.1", wire: /^gpt-4\.1$/u },
    hostModel: "openai/gpt-4o",
    outOfProcess: true,
    compaction: "native",
    askedOnce: requestedTools => requestedTools.length === 1,
  },
  fx: {
    adapter: endpoint => createFx({ auth: { AI_GATEWAY_API_KEY: "fixture-only", AI_GATEWAY_BASE_URL: gatewayBase(endpoint) } }),
    readOnly: (endpoint, settings) => createFx({ ...settings, auth: { AI_GATEWAY_API_KEY: "fixture-only", AI_GATEWAY_BASE_URL: gatewayBase(endpoint) } }),
    auth: endpoint => ({ AI_GATEWAY_API_KEY: "fixture-only", AI_GATEWAY_BASE_URL: gatewayBase(endpoint), VERCEL_OIDC_TOKEN: "" }),
    // FX's own loopback overrides; its requests do not use the adapter's generic AI_GATEWAY_BASE_URL.
    environment: (_home, endpoint) => ({
      FX_GATEWAY_BASE_URL: gatewayBase(endpoint), FX_GATEWAY_CHAT_URL: `${gatewayBase(endpoint)}/v4/ai/language-model`,
      FX_DISABLE_KEYCHAIN: "1", FX_E2E_DISABLE_DOTENV: "1", FX_AUTO_UPGRADE: "0",
    }),
    prepareHome: async () => {},
    loopback: toolRequest => (toolRequest
      ? { toolRequest: { ...toolRequest, discovery: { name: "capability_search", input: { query: toolRequest.name } } } } : {}),
    secondModel: { selection: "openai/gpt-5.5", wire: /^openai\/gpt-5\.5$/u },
    outOfProcess: false,
    compaction: "unsupported",
    askedOnce: onceEndingWith("dojo_ui_ask"),
  },
  pi: {
    adapter: (endpoint, home) => createPi({ agentDir: join(home, ".pi/agent"), auth: openai(endpoint) }),
    readOnly: (endpoint, settings) => createPi({ reattachInProcess: false, ...settings, auth: openai(endpoint) }),
    // agentAdapter("pi") passes no auth, so Pi reads OPENAI_* from the host child's environment.
    auth: openai,
    environment: home => ({ PI_CODING_AGENT_DIR: join(home, ".pi/agent") }),
    prepareHome: async home => { await mkdir(join(home, ".pi/agent"), { recursive: true }); },
    loopback: toolRequest => (toolRequest ? { toolRequest } : {}),
    firstModel: "openai/gpt-4o", firstWire: /^gpt-4o$/u,
    secondModel: { selection: "openai/gpt-4.1", wire: /^gpt-4\.1$/u },
    hostModel: "openai/gpt-4o",
    outOfProcess: false,
    compaction: "native",
    askedOnce: onceEndingWith("dojo_ui_ask"),
  },
};

export const seedMarkers = { skill: "DOJO_SEEDED_SKILL_MARKER", rules: "DOJO_SEEDED_RULES_MARKER" } as const;

// A stdio MCP server that logs every method and offers one write-capable tool (step 4 uses it for open risk 10).
const seededServer = `import { appendFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
const root = ${"${ROOT}"};
const send = message => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\\n");
createInterface({ input: process.stdin }).on("line", line => {
  let request;
  try { request = JSON.parse(line); } catch { return; }
  appendFileSync(root + "/seeded-mcp.log", request.method + "\\n");
  if (request.id === undefined) return;
  if (request.method === "initialize") send({ id: request.id, result: { protocolVersion: request.params?.protocolVersion ?? "2025-06-18",
    capabilities: { tools: {} }, serverInfo: { name: "dojo-seeded", version: "1.0.0" } } });
  else if (request.method === "tools/list") send({ id: request.id, result: { tools: [{ name: "dojo_seeded_write",
    description: "Write a marker file.", inputSchema: { type: "object", properties: {} } }] } });
  else if (request.method === "tools/call") { writeFileSync(root + "/seeded-mcp-wrote", "written\\n"); send({ id: request.id, result: { content: [{ type: "text", text: "written" }] } }); }
  else send({ id: request.id, error: { code: -32601, message: "Method not found" } });
});
`;

const skill = (description: string) => `---\nname: dojo-seeded\ndescription: ${description}\n---\n\nFollow ${description}.\n`;
const write = async (path: string, content: string) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, content); };

/** Writes the agent's user-config seeds (step 3 plan, "User-config seeds") into the case's HOME and config homes. */
export async function userConfigSeeds(agent: TierAAgent, root: string, home: string) {
  const script = join(root, "seeded-mcp.mjs");
  await writeFile(script, seededServer.replace("${ROOT}", JSON.stringify(root)));
  const claude = async () => {
    await write(join(home, ".claude.json"), JSON.stringify({ mcpServers: { "dojo-seeded": { type: "stdio", command: process.execPath, args: [script] } } }));
    await write(join(home, ".claude/skills/dojo-seeded/SKILL.md"), skill(seedMarkers.skill));
    await write(join(home, ".claude/CLAUDE.md"), `${seedMarkers.rules}\n`);
  };
  const seeds: Record<TierAAgent, () => Promise<void>> = {
    claude,
    codex: async () => {
      await write(join(home, ".codex/config.toml"), `[mcp_servers.dojo-seeded]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(script)}]\n`);
      await write(join(home, ".agents/skills/dojo-seeded/SKILL.md"), skill(seedMarkers.skill));
      await write(join(home, ".codex/AGENTS.md"), `${seedMarkers.rules}\n`);
    },
    // Grok loads Claude's MCP servers, skills and rules.
    grok: claude,
    opencode: async () => {
      await write(join(home, ".config/opencode/opencode.json"), JSON.stringify({ mcp: { "dojo-seeded": { type: "local", command: [process.execPath, script] } } }));
      await write(join(home, ".config/opencode/skills/dojo-seeded/SKILL.md"), skill(seedMarkers.skill));
      await write(join(home, ".config/opencode/AGENTS.md"), `${seedMarkers.rules}\n`);
    },
    // FX's MCP config format and any rules file are unknown.
    fx: async () => { await write(join(home, ".agents/skills/dojo-seeded/SKILL.md"), skill(seedMarkers.skill)); },
    // Unverified that Pi has an MCP client.
    pi: async () => {
      await write(join(home, ".pi/agent/skills/dojo-seeded/SKILL.md"), skill(seedMarkers.skill));
      await write(join(home, ".pi/agent/AGENTS.md"), `${seedMarkers.rules}\n`);
    },
  };
  await seeds[agent]();
}

/** Main-loop requests (those that offer tools) whose JSON contains `text`, never a background request (decision 8). */
export function requestsCarrying(endpoint: LoopbackEndpoint, text: string) {
  return endpoint.requests.flatMap((request, index) => endpoint.toolLists[index]?.length && JSON.stringify(request).includes(text)
    ? [{ index, request, model: endpoint.requestedModels[index] }] : []);
}

/** Processes other than this one whose command line contains any marker. */
export async function nativeProcesses(markers: readonly string[]): Promise<Array<{ pid: number; command: string }>> {
  let rows: Array<{ pid: number; command: string }>;
  if (process.platform === "linux") {
    rows = [];
    for (const entry of await readdir("/proc")) {
      if (!/^\d+$/u.test(entry)) continue;
      const command = await readFile(`/proc/${entry}/cmdline`, "utf8").catch(() => "");
      rows.push({ pid: Number(entry), command: command.replaceAll("\0", " ") });
    }
  } else {
    const { stdout } = await promisify(execFile)("ps", ["-axww", "-o", "pid=,command="], { maxBuffer: 16 * 1024 * 1024 });
    rows = stdout.split("\n").map(line => /^\s*(\d+)\s+(.*)$/u.exec(line)).flatMap(match => match ? [{ pid: Number(match[1]), command: match[2]! }] : []);
  }
  return rows.filter(row => row.pid !== process.pid && markers.some(marker => row.command.includes(marker)));
}

/** Polls for up to 10 s; a case that leaves a native process fails, and the leftovers are killed so later cases start clean. */
export async function expectNoNativeProcesses(markers: readonly string[]) {
  let left = await nativeProcesses(markers);
  for (const deadline = Date.now() + 10_000; left.length && Date.now() < deadline; left = await nativeProcesses(markers)) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  for (const { pid } of left) { try { process.kill(pid, "SIGKILL"); } catch {} }
  expect(left, "native processes left after the case").toEqual([]);
}

/** stop() after a cancellation resolves, or rejects with exactly that cancellation's reason (decision 9). */
export async function stopAfterCancel(session: { stop(): Promise<unknown> }, reason: unknown) {
  try { await session.stop(); }
  catch (error) { expect(error).toBe(reason); }
}

/** Every file below `path`, by relative path, with its bytes. */
export async function snapshotDirectory(path: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(path, { recursive: true, withFileTypes: true })) {
    const file = join(entry.parentPath, entry.name);
    files[relative(path, file)] = entry.isFile() ? (await readFile(file)).toString("base64") : entry.isDirectory() ? "<directory>" : "<other>";
  }
  return files;
}

/** Records a value under `<out>/observations/<agent>.json`, at a dotted key such as "userConfig.kyoshi". */
export async function observe(agent: TierAAgent, key: string, value: unknown) {
  const path = join(conformancePaths().out, "observations", `${agent}.json`);
  await mkdir(dirname(path), { recursive: true });
  const observations = existsSync(path) ? JSON.parse(await readFile(path, "utf8")) : {};
  const keys = key.split(".");
  let target = observations;
  for (const part of keys.slice(0, -1)) target = target[part] ??= {};
  target[keys.at(-1)!] = value;
  await writeFile(path, `${JSON.stringify(observations, null, 2)}\n`);
}

export interface CaseContext {
  agent: TierAAgent;
  id: string;
  root: string;
  home: string;
  course: string;
  wiring: AgentWiring;
  markers: string[];
  /** Starts this case's loopback model, prepares the case home for it and closes it with the case. */
  loopback(toolRequest?: ToolRequest, options?: Record<string, unknown>): Promise<LoopbackEndpoint>;
  /** The allow-listed environment of a harness-level sandbox. */
  environment(endpoint: LoopbackEndpoint): NodeJS.ProcessEnv;
  defer(cleanup: () => Promise<unknown> | unknown): void;
  close(): Promise<void>;
}

/** A case root with a clean user home that reuses the agent's shared bootstrap (step 3 plan, conformance.fixture.ts). */
export async function openCase(agent: TierAAgent, id: string, harnessPath: string, { course = true } = {}): Promise<CaseContext> {
  const root = await realpath(await mkdtemp(join(tmpdir(), `dojo-conformance-${agent}-${id}-`)));
  const home = join(root, "home");
  await mkdir(home);
  if (course) {
    await mkdir(join(root, "course"));
    await writeFile(join(root, "course/lesson.md"), "# Lesson\n\nTeach one concept at a time.\n");
  }
  const shared = agentHome(agent);
  await mkdir(join(shared, ".ai-sdk-harness"), { recursive: true });
  await symlink(join(shared, ".ai-sdk-harness"), join(home, ".ai-sdk-harness"));
  if (agent === "grok") {
    await mkdir(join(shared, ".grok/bin"), { recursive: true });
    await mkdir(join(home, ".grok"));
    await symlink(join(shared, ".grok/bin"), join(home, ".grok/bin"));
  }
  const cleanups: Array<() => Promise<unknown> | unknown> = [];
  const markers = [...new Set([root, shared, await realpath(shared)])];
  const context: CaseContext = {
    agent, id, root, home, course: join(root, "course"), wiring: wiring[agent], markers,
    async loopback(toolRequest, options = {}) {
      const endpoint: LoopbackEndpoint = await startLoopbackModel({ ...wiring[agent].loopback(toolRequest), ...options });
      cleanups.push(() => endpoint.close());
      await wiring[agent].prepareHome(home, endpoint);
      return endpoint;
    },
    environment: endpoint => ({ ...caseBaseEnvironment(home), PATH: harnessPath, HOME: home, ...wiring[agent].environment(home, endpoint) }),
    defer: cleanup => { cleanups.push(cleanup); },
    async close() {
      const failures: unknown[] = [];
      for (const cleanup of cleanups.reverse()) {
        try { await cleanup(); } catch (error) { failures.push(error); }
      }
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
      if (failures.length) throw new AggregateError(failures, `Closing ${agent} ${id} failed`);
    },
  };
  return context;
}

export interface HostResult { results: Array<Record<string, unknown>>; error?: string; exitCode: number | null; output: string }

/** A running conformance-host.mjs child: its results so far, a line to its stdin, and its end. */
export interface HostRun {
  results: Array<Record<string, unknown>>;
  /** The first result with this step, once the driver prints it */
  step(name: string, timeoutMs?: number): Promise<Record<string, unknown>>;
  send(line: string): void;
  /** SIGKILL to the driver's process group (crash-after-park) */
  kill(): void;
  pid: number;
  done: Promise<HostResult>;
}

/** Runs scripts/conformance-host.mjs in a child process group with the host environment; kills the group after 180 s.
 *  `hostPort` is the host-port fixture's URL; Sensei's host reads its session and course through it. */
export function runHost(context: CaseContext, endpoint: LoopbackEndpoint, harnessPath: string,
  options: { scenario: string; persona: "kyoshi" | "sensei"; hostPort?: string; model?: string; workspaceId?: string }): HostRun {
  const environment = {
    ...context.environment(endpoint),
    PATH: [join(authoring, "node_modules/.bin"), harnessPath].join(delimiter),
    // Eve substitutes mock models under NODE_ENV=test; srvx skips its shutdown handlers under CI and TEST.
    NODE_ENV: "development", EVE_MOCK_AUTHORED_MODELS: "0", CI: "", TEST: "",
    ...context.wiring.auth(endpoint),
  };
  const args = ["scripts/conformance-host.mjs", options.scenario, context.agent, context.root, ...(options.model ? [options.model] : []),
    "--persona", options.persona, ...(options.hostPort ? ["--host-port", options.hostPort] : []), "--workspace-id", options.workspaceId ?? `w-${context.agent}`];
  const child = spawn(process.execPath, args, { cwd: authoring, env: environment, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  const results: Array<Record<string, unknown>> = [];
  const waiting: Array<{ name: string; resolve(value: Record<string, unknown>): void }> = [];
  let pending = "";
  child.stdout.on("data", chunk => {
    output += chunk;
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("CONFORMANCE_RESULT ")) continue;
      const result = JSON.parse(line.slice("CONFORMANCE_RESULT ".length)) as Record<string, unknown>;
      results.push(result);
      for (const waiter of waiting.filter(entry => entry.name === result.step)) waiter.resolve(result);
    }
  });
  child.stderr.on("data", chunk => { output += chunk; });
  const killGroup = () => { try { process.kill(-child.pid!, "SIGKILL"); } catch {} };
  context.defer(killGroup);
  const timer = setTimeout(killGroup, 180_000);
  const done = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", code => resolve(code));
  }).finally(() => clearTimeout(timer)).then(exitCode => {
    const lines = output.split("\n");
    return { results, error: lines.find(line => line.startsWith("CONFORMANCE_ERROR "))?.slice("CONFORMANCE_ERROR ".length), exitCode, output };
  });
  return {
    results, pid: child.pid!, done,
    send: line => { child.stdin.write(`${line}\n`); },
    kill: killGroup,
    step: (name, timeoutMs = 150_000) => {
      const found = results.find(result => result.step === name);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`No "${name}" from the host driver: ${output.slice(-3000)}`)), timeoutMs);
        waiting.push({ name, resolve: value => { clearTimeout(timeout); resolve(value); } });
        void done.then(result => { if (!results.some(entry => entry.step === name)) { clearTimeout(timeout); reject(new Error(`The host driver ended without "${name}": ${result.error ?? result.output.slice(-3000)}`)); } });
      });
    },
  };
}

/** Kyoshi's ask-answer-across-restart run to its end (step 3's helper). */
export async function runKyoshiHost(context: CaseContext, endpoint: LoopbackEndpoint, harnessPath: string, model?: string): Promise<HostResult> {
  return runHost(context, endpoint, harnessPath, { scenario: "ask-answer-across-restart", persona: "kyoshi", model }).done;
}

/** Where an agent writes its own log under the case home */
const nativeLogDirectories: Partial<Record<TierAAgent, string>> = { opencode: ".local/share/opencode/log" };

/** The last lines of each of the agent's own log files in the case home, for a failing case's diagnostics. */
export async function nativeLogTail(context: CaseContext, lines = 25): Promise<Record<string, string>> {
  const directory = nativeLogDirectories[context.agent];
  if (!directory) return {};
  const files = await readdir(join(context.home, directory)).catch(() => [] as string[]);
  return Object.fromEntries(await Promise.all(files.map(async name =>
    [name, (await readFile(join(context.home, directory, name), "utf8").catch(() => "")).trimEnd().split("\n").slice(-lines).join("\n")])));
}

/** Native processes of the agent only: neither the host driver nor its Eve server. */
export async function agentProcesses(markers: readonly string[]) {
  return (await nativeProcesses(markers)).filter(row => !row.command.includes("conformance-host.mjs") && !row.command.includes(".output/server/index.mjs"));
}

/** Calls the loopback makes in order on main-loop requests, by name whether the agent offers them or not, then "Ready to teach.". */
export function scriptedCalls(sequence: ToolRequest[]): Record<string, unknown> {
  let index = 0;
  const next = (input: { tools?: unknown[] }) => (input.tools?.length && index < sequence.length ? sequence[index++] : undefined);
  return { selectMessagesTool: next, selectChatTool: next, selectResponsesTool: next, selectGatewayTool: next };
}

/** Native calls per agent, as each runtime names them on the wire at the pinned versions (read from the loopback's tool lists). */
export const nativeCalls: Record<TierAAgent, {
  write(path: string, content: string): ToolRequest;
  edit(path: string, from: string, to: string): ToolRequest;
  shell(command: string): ToolRequest;
  read(path: string): ToolRequest;
}> = {
  claude: {
    write: (path, content) => ({ name: "Write", input: { file_path: path, content } }),
    edit: (path, from, to) => ({ name: "Edit", input: { file_path: path, old_string: from, new_string: to } }),
    shell: command => ({ name: "Bash", input: { command } }),
    read: path => ({ name: "Read", input: { file_path: path } }),
  },
  // Codex has no file tool: it writes, edits and reads through its shell
  codex: {
    write: (path, content) => ({ name: "exec_command", input: { cmd: `printf '%s' '${content}' > '${path}'` } }),
    edit: (path, from, to) => ({ name: "exec_command", input: { cmd: `sed -i.bak 's/${from}/${to}/' '${path}'` } }),
    shell: command => ({ name: "exec_command", input: { cmd: command } }),
    read: path => ({ name: "exec_command", input: { cmd: `cat '${path}'` } }),
  },
  grok: {
    write: (path, content) => ({ name: "write", input: { file_path: path, content } }),
    edit: (path, from, to) => ({ name: "search_replace", input: { file_path: path, old_string: from, new_string: to } }),
    shell: command => ({ name: "run_terminal_command", input: { command } }),
    read: path => ({ name: "read_file", input: { target_file: path } }),
  },
  opencode: {
    write: (path, content) => ({ name: "write", input: { filePath: path, content } }),
    edit: (path, from, to) => ({ name: "edit", input: { filePath: path, oldString: from, newString: to } }),
    shell: command => ({ name: "bash", input: { command } }),
    read: path => ({ name: "read", input: { filePath: path } }),
  },
  fx: {
    write: (path, content) => ({ name: "write", input: { file_path: path, content } }),
    edit: (path, from, to) => ({ name: "edit", input: { file_path: path, old_string: from, new_string: to } }),
    shell: command => ({ name: "bash", input: { command } }),
    read: path => ({ name: "read", input: { file_path: path } }),
  },
  pi: {
    write: (path, content) => ({ name: "write", input: { file_path: path, content } }),
    edit: (path, from, to) => ({ name: "edit", input: { file_path: path, old_string: from, new_string: to } }),
    shell: command => ({ name: "bash", input: { command } }),
    read: path => ({ name: "read", input: { file_path: path } }),
  },
};

/** Tool names a read-only offer may carry beyond readOnlyToolNames(…).native, with why. */
export const toolListExtras: Record<TierAAgent, Record<string, string>> = {
  claude: {},
  codex: { tool_search: "Codex's catalog search, which reaches only host tools in a read-only call", request_user_input: "Codex's own question tool, answered by the host" },
  // A deny row (D18): its built-ins stay registered, and every call outside the allow-list is refused (sensei.read-only.adversarial-native-calls)
  grok: Object.fromEntries(["run_terminal_command", "search_replace", "write", "kill_command_or_subagent", "todo_write", "get_command_or_subagent_output",
    "scheduler_create", "scheduler_delete", "scheduler_list", "monitor", "workflow", "enter_plan_mode", "exit_plan_mode", "ask_user_question",
    "send_feedback", "web_search", "image_gen", "image_edit", "image_to_video", "reference_to_video"]
    .map(name => [name, "Grok keeps its built-ins registered (deny row); a call outside the allow-list is refused"])),
  opencode: {},
  fx: { capability_search: "FX discovers host tools through it", askUserQuestions: "FX's question tool, answered by the host" },
  pi: {},
};

export const senseiTools = [
  { type: "function" as const, name: "ask_question", description: "Ask the learner one question.",
    inputSchema: { type: "object" as const, properties: { question: { type: "string" } }, required: ["question"] } },
  { type: "function" as const, name: "dojo_context", description: "Retrieve the current course.", inputSchema: { type: "object" as const, properties: {} } },
];

/** One read-only model call, the path Sensei's model takes: production readOnlyEnvironment and adapter settings, the fixture's auth only. */
export async function runSenseiModel(context: CaseContext, endpoint: LoopbackEndpoint, options: {
  prompt: string; eveSessionId?: string; sandbox?: ReturnType<typeof createLocalHarnessSandbox>; onResumeFailure?(failure: ResumeFailure): void;
  checkpoint?: Array<Record<string, unknown>>;
} ) {
  const eveSessionId = options.eveSessionId ?? `eve-${context.agent}-${Date.now()}`;
  const stateDirectory = join(context.home, ".dojofoo/state");
  const environment = await readOnlyEnvironment(context.agent, context.environment(endpoint), { stateDirectory, eveSessionId });
  const settings = await readOnlyAdapterSettings(context.agent, context.environment(endpoint));
  const adapter = context.wiring.readOnly(endpoint, settings);
  const harness = agentRow(context.agent).readOnly?.prevention === "deny" ? withoutBuiltinFiltering(adapter) : adapter;
  const sandbox = options.sandbox ?? createLocalHarnessSandbox(context.root, { environment });
  const records: PreventionRecord[] = [];
  const { model } = experimental_createHarnessModel({ harness, sandbox, sandboxConfig: { workDir: "course" },
    ...(context.wiring.firstModel ? { model: context.wiring.firstModel } : {}) } as never,
  { mode: "read-only", agent: context.agent, eveSessionId, onPrevention: record => records.push(record), onResumeFailure: options.onResumeFailure });
  const prompt = [...(options.checkpoint ?? []), { role: "user", content: [{ type: "text", text: options.prompt }] }];
  const parts: Array<Record<string, unknown>> = [];
  let failure: unknown;
  try {
    const { stream } = await model.doStream({ prompt: prompt as never, tools: senseiTools, abortSignal: AbortSignal.timeout(120_000) });
    for await (const part of stream as unknown as AsyncIterable<Record<string, unknown>>) parts.push(part);
  } catch (error) { failure = error; }
  const text = parts.filter(part => part.type === "text-delta").map(part => part.delta).join("");
  const harnessMetadata = ([...parts].reverse().find(part => (part.providerMetadata as { harness?: { resumeFrom?: unknown } } | undefined)?.harness?.resumeFrom)
    ?.providerMetadata as { harness?: unknown } | undefined)?.harness;
  return { parts, records, text, failure, eveSessionId, sandbox, environment,
    /** The assistant message that carries this turn's checkpoint, for the next call's prompt */
    checkpoint: harnessMetadata ? [{ role: "user", content: [{ type: "text", text: options.prompt }] },
      { role: "assistant", content: [{ type: "text", text, providerOptions: { harness: harnessMetadata } }] }] : undefined,
    ...readOnlyToolNames(context.agent, senseiTools.map(tool => tool.name)) };
}
