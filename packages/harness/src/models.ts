import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolveAgentExecutable } from "@dojofoo/config/agent-installations";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import { createServer, type AddressInfo } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { JSONRPCClient } from "json-rpc-2.0";
import { parse } from "smol-toml";
import { agentRow, type AgentId, type ModelChoice } from "@dojofoo/protocol";
import { readOnlyEnvironment } from "./read-only.js";

/** Preserve the native CLI choice when the caller has not selected a model. In-process libfx's own default belongs to the
 *  gateway and fails on a subscription login, so FX starts on the first model the user's CLI lists for its active provider.
 *  Sensei's Pi and OpenCode run without the user's settings, so their sessions name a model too: Pi the default in the user's
 *  settings.json while it can run, else the first one that can; OpenCode the one it picks itself. */
export async function configuredHarnessModel(harness: string, codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex"),
  listFx = () => fxModels(AbortSignal.timeout(15_000)), options: { piAgentDir?: string; listPi?: () => Promise<HarnessModelChoice[]>;
    openCodeDefault?: () => Promise<string | undefined> } = {}): Promise<string | undefined> {
  if (harness === "fx") return (await listFx().catch(() => []))[0]?.id;
  if (harness === "opencode") return (options.openCodeDefault ?? (() => openCodeDefaultModel(AbortSignal.timeout(30_000))))().catch(() => undefined);
  if (harness === "pi") {
    const agentDir = options.piAgentDir ?? process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
    const usable = (await (options.listPi ?? (() => piModels(AbortSignal.timeout(15_000), agentDir)))().catch(() => [])).filter(model => !model.unavailable);
    const settings = await piSettings(agentDir);
    const preferred = typeof settings.defaultProvider === "string" && typeof settings.defaultModel === "string"
      ? `${settings.defaultProvider}/${settings.defaultModel}` : undefined;
    return (usable.find(model => model.id === preferred) ?? usable[0])?.id;
  }
  if (harness !== "codex") return undefined;
  const model = (await codexConfig(codexHome))?.model;
  return typeof model === "string" && model.trim() ? model : undefined;
}

/** The effort a new conversation starts at, from the agent's own configuration: Codex's model_reasoning_effort, Pi's
 *  defaultThinkingLevel while the model takes it. Sensei runs both without the user's configuration, so the session names it,
 *  and the composer shows what runs. */
export async function configuredHarnessEffort(harness: string, model: string | undefined,
  codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex"),
  options: { piAgentDir?: string; listPi?: () => Promise<HarnessModelChoice[]> } = {}): Promise<string | undefined> {
  if (harness === "codex") {
    const effort = (await codexConfig(codexHome))?.model_reasoning_effort;
    return typeof effort === "string" && effort.trim() ? effort : undefined;
  }
  if (harness !== "pi" || !model) return undefined;
  const agentDir = options.piAgentDir ?? process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  const level = (await piSettings(agentDir)).defaultThinkingLevel;
  if (typeof level !== "string") return undefined;
  const listed = (await (options.listPi ?? (() => piModels(AbortSignal.timeout(15_000), agentDir)))().catch(() => [])).find(choice => choice.id === model);
  return listed?.efforts.includes(level) ? level : undefined;
}

const piSettings = (agentDir: string) => readFile(join(agentDir, "settings.json"), "utf8")
  .then(source => JSON.parse(source) as Record<string, unknown>, (): Record<string, unknown> => ({}));

async function codexConfig(codexHome: string): Promise<Record<string, unknown> | undefined> {
  try { return parse(await readFile(join(codexHome, "config.toml"), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Removed in step 7 with SessionModelConfiguration. */
export type HarnessModelChoice = ModelChoice;

/** The agent's models, its default among them: Claude Code's own "default", else the model a new conversation starts on
 *  (configuredHarnessModel), else the one the agent's catalog marks (Codex) */
export async function harnessModels(agent: AgentId, signal: AbortSignal): Promise<HarnessModelChoice[]> {
  const choices = await listedModels(agent, signal);
  const configured = agent === "claude" ? "default"
    : await configuredHarnessModel(agent, undefined, async () => choices, { listPi: async () => choices }).catch(() => undefined);
  if (!configured || !choices.some(choice => choice.id === configured)) return choices;
  return choices.map(({ default: _default, ...choice }) => choice.id === configured ? { ...choice, default: true } : choice);
}

async function listedModels(agent: AgentId, signal: AbortSignal): Promise<HarnessModelChoice[]> {
  const discovery = agentRow(agent).modelDiscovery;
  if (discovery?.method === "cli-aliases") return discovery.aliases.map(id => ({ id, name: id, efforts: [] }));
  if (discovery?.method === "claude-sdk") return claudeModels(signal);
  if (discovery?.method === "acp-probe") return agent === "cursor" || agent === "grok" ? acpModels(agent, signal) : [];
  if (discovery?.method !== "native") return [];
  if (agent === "codex") return codexModels(signal);
  if (agent === "fx") return fxModels(signal);
  if (agent === "pi") return piModels(signal);
  if (agent === "opencode") return openCodeModels(signal);
  throw new Error(`${agentRow(agent).name} model discovery is not available here yet. Use its native CLI to select a model.`);
}

/** Claude Code lists its models only in a session: the Agent SDK starts one against the installed CLI, reads supportedModels()
 *  after the handshake and closes it. No prompt is sent and no settings are loaded. "default" is Claude Code's own choice; its
 *  description names the model it resolves to. */
export async function claudeModels(signal: AbortSignal, executable = resolveAgentExecutable("claude")): Promise<HarnessModelChoice[]> {
  if (!executable) return [];
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const abortController = new AbortController();
  const abort = () => abortController.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  // The session waits on input that never comes, so nothing reaches the model
  const idle = (async function* (): AsyncGenerator<never> {
    await new Promise(resolve => abortController.signal.addEventListener("abort", resolve, { once: true }));
  })();
  const session = query({ prompt: idle, options: { pathToClaudeCodeExecutable: executable, settingSources: [], persistSession: false, abortController } });
  try {
    const models = await session.supportedModels();
    // Each model's own default effort: the CLI applies it when the model is set and reports it as applied.effort (~25 ms a model)
    const settings = session as unknown as { getSettings(): Promise<{ applied?: { effort?: string | null } }> };
    const choices: HarnessModelChoice[] = [];
    for (const model of models) {
      const efforts = (model as { supportedEffortLevels?: string[] }).supportedEffortLevels ?? [];
      let defaultEffort: string | undefined;
      if (efforts.length) {
        await session.applyFlagSettings({ model: model.value });
        defaultEffort = (await settings.getSettings()).applied?.effort ?? undefined;
      }
      // Claude Code names its own choice "Default (recommended)"; the menu doesn't recommend a model
      choices.push({ id: model.value, name: model.displayName.replace(/\s*\(recommended\)$/iu, ""),
        ...(model.description ? { description: model.description } : {}), efforts,
        ...(defaultEffort && efforts.includes(defaultEffort) ? { defaultEffort } : {}) });
    }
    return choices;
  } finally {
    signal.removeEventListener("abort", abort);
    abortController.abort();
    session.close();
  }
}

const acpLaunch = { cursor: ["--disable-auto-update", "acp"], grok: ["agent", "stdio"] } as const;

/** Cursor and Grok list their models only in an ACP session: start one in an empty folder, read its model list, close it and stop
 *  the CLI. No prompt is sent. A missing CLI lists none. Grok keeps a closed or deleted session in its history (open risk 3), so its
 *  probe runs in a throwaway copy of Sensei's private home, which lists the models Sensei can use and is removed afterwards. */
export async function acpModels(agent: "cursor" | "grok", signal: AbortSignal,
  options: { executable?: string; args?: readonly string[]; environment?: NodeJS.ProcessEnv } = {}): Promise<HarnessModelChoice[]> {
  const executable = options.executable ?? resolveAgentExecutable(agent);
  if (!executable) return [];
  const cwd = await mkdtemp(join(tmpdir(), `dojo-${agent}-models-`));
  const state = agent === "grok" ? await mkdtemp(join(tmpdir(), "dojo-grok-models-home-")) : undefined;
  const environment = state
    ? await readOnlyEnvironment("grok", options.environment ?? process.env, { stateDirectory: state, eveSessionId: "model-probe" })
    : options.environment ?? process.env;
  const child = spawn(executable, [...(options.args ?? acpLaunch[agent])], { cwd, env: environment, stdio: ["pipe", "pipe", "ignore"] });
  const rpc = new JSONRPCClient(request => new Promise<void>((resolve, reject) => {
    child.stdin.write(`${JSON.stringify(request)}\n`, error => error ? reject(error) : resolve());
  }));
  const lines = createInterface({ input: child.stdout });
  let failure: Error | undefined;
  let missing = false;
  const fail = (error: Error) => { failure ??= error; rpc.rejectAllPendingRequests(error.message); };
  const abort = () => { fail(new Error("Model discovery cancelled")); child.kill(); };
  const timeout = setTimeout(() => fail(new Error(`${agentRow(agent).name} did not list its models in time`)), 15_000);
  child.on("error", error => { if ((error as NodeJS.ErrnoException).code === "ENOENT") missing = true; fail(error); });
  child.stdin.on("error", fail);
  child.on("exit", () => fail(new Error(`${agentRow(agent).name} exited before model discovery completed`)));
  lines.on("line", line => {
    let message: { method?: unknown; id?: unknown; result?: unknown; error?: unknown };
    try { message = JSON.parse(line); } catch { return; }
    // Only answers to this probe; the agent's own requests and notifications are not part of it
    if (message.method === undefined && message.id !== undefined) rpc.receive(message as Parameters<typeof rpc.receive>[0]);
  });
  signal.addEventListener("abort", abort, { once: true });
  const request = async (method: string, params: unknown) => {
    signal.throwIfAborted();
    if (failure) throw failure;
    return rpc.request(method, params);
  };
  try {
    const initialized = await request("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
    const session = await request("session/new", { cwd, mcpServers: [] });
    const choices = agent === "cursor" ? cursorModels(session?.configOptions) : grokModels(session?.models?.availableModels);
    const capabilities = initialized?.agentCapabilities?.sessionCapabilities;
    if (capabilities?.close && typeof session?.sessionId === "string") {
      await request("session/close", { sessionId: session.sessionId }).catch(() => {});
    }
    // The probe is not a conversation: it leaves no session in the agent's history when the agent can delete one (open risk 3)
    if (capabilities?.delete && typeof session?.sessionId === "string") {
      await request("session/delete", { sessionId: session.sessionId }).catch(() => {});
    }
    return choices;
  } catch (error) {
    if (missing) return [];
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    lines.close();
    rpc.rejectAllPendingRequests("Model discovery finished");
    child.stdin.end();
    child.kill();
    await rm(cwd, { recursive: true, force: true });
    if (state) await rm(state, { recursive: true, force: true, maxRetries: 3 });
  }
}

type AcpSelectOption = { value?: unknown; name?: unknown; options?: AcpSelectOption[] };
/** Cursor's model select among the session's config options (the ACP probe's `session/new` answer). */
function cursorModels(configOptions: unknown): HarnessModelChoice[] {
  if (!Array.isArray(configOptions)) return [];
  const option = configOptions.find(candidate => candidate?.type === "select" && candidate.id === "model")
    ?? configOptions.find(candidate => candidate?.type === "select" && candidate.category === "model");
  if (!option || !Array.isArray(option.options)) return [];
  const values = (option.options as AcpSelectOption[]).flatMap(candidate => Array.isArray(candidate.options) ? candidate.options : [candidate]);
  return unique(values.flatMap(value => typeof value.value === "string" ? [{ id: value.value, name: typeof value.name === "string" ? value.name : value.value, efforts: [] }] : []));
}

function grokModels(available: unknown): HarnessModelChoice[] {
  if (!Array.isArray(available)) return [];
  return unique(available.flatMap(model => typeof model?.modelId === "string"
    ? [{ id: model.modelId, name: typeof model.name === "string" ? model.name : model.modelId, efforts: [] }] : []));
}

const unique = (choices: HarnessModelChoice[]) => choices.filter((choice, index) => choices.findIndex(other => other.id === choice.id) === index);

/** OpenCode as Sensei runs it: the copy the adapter installs under ~/.ai-sdk-harness, in Sensei's private home, so it answers with the
 *  models a turn can use. Before a first turn installs that copy, the user's own OpenCode answers. */
async function withSenseiOpenCode<T>(run: (executable: string | undefined, environment: NodeJS.ProcessEnv, cwd: string) => Promise<T>,
  options: { executable?: string; environment?: NodeJS.ProcessEnv }): Promise<T> {
  const bundled = join(homedir(), ".ai-sdk-harness", ".harness-bootstrap", "opencode", "node_modules", ".bin", "opencode");
  const executable = options.executable ?? process.env.OPENCODE_BIN ?? (existsSync(bundled) ? bundled : undefined);
  const state = await mkdtemp(join(tmpdir(), "dojo-opencode-models-home-"));
  try {
    return await run(executable, options.environment ?? await readOnlyEnvironment("opencode", process.env, { stateDirectory: state, eveSessionId: "model-probe" }), state);
  } finally { await rm(state, { recursive: true, force: true, maxRetries: 3 }); }
}

/** OpenCode's models with their names and reasoning variants (`models --verbose`); the user's own OpenCode lists only ids */
export function openCodeModels(signal: AbortSignal, options: { executable?: string; environment?: NodeJS.ProcessEnv } = {}): Promise<HarnessModelChoice[]> {
  return withSenseiOpenCode(async (executable, env, cwd) => {
    const run = (command: string, args: string[]) => promisify(execFile)(command, args, { signal, timeout: 30_000, maxBuffer: 16 * 1024 * 1024, env, cwd });
    const { stdout } = executable ? await run(executable, ["models", "--verbose"]) : await run(resolveAgentExecutable("opencode") ?? "opencode", ["models"]);
    return parseOpenCodeModels(stdout);
  }, options);
}

/** Sensei's OpenCode serving on a free loopback port while `use` runs with its base URL; undefined when OpenCode exits before it
 *  serves. It reads the user's logins (XDG_DATA_HOME), so a login it saves is the one Sensei's OpenCode uses. */
export function openCodeServer<T>(signal: AbortSignal, use: (base: string) => Promise<T>,
  options: { executable?: string; environment?: NodeJS.ProcessEnv } = {}): Promise<T | undefined> {
  return withSenseiOpenCode(async (executable, env, cwd) => {
    const port = await new Promise<number>((resolvePort, reject) => {
      const server = createServer().once("error", reject).listen(0, "127.0.0.1", () => {
        const { port: free } = server.address() as AddressInfo;
        server.close(() => resolvePort(free));
      });
    });
    const child = spawn(executable ?? resolveAgentExecutable("opencode") ?? "opencode", ["serve", "--port", String(port), "--hostname", "127.0.0.1"],
      { cwd, env, stdio: "ignore" });
    let exited = false;
    child.once("exit", () => { exited = true; });
    child.once("error", () => { exited = true; });
    const base = `http://127.0.0.1:${port}`;
    try {
      while (!exited) {
        signal.throwIfAborted();
        if ((await fetch(`${base}/config/providers`, { signal }).catch(() => undefined))?.ok) return await use(base);
        await new Promise(resolveWait => setTimeout(resolveWait, 200));
      }
      return undefined;
    } finally { child.kill(); }
  }, options);
}

/** The model OpenCode picks when none is set: its server's default for its first provider (`GET /config/providers`). It has no
 *  command that prints it, and its pick is neither the newest nor the first it lists. */
export function openCodeDefaultModel(signal: AbortSignal, options: { executable?: string; environment?: NodeJS.ProcessEnv } = {}): Promise<string | undefined> {
  return openCodeServer(signal, async base => {
    const config = await (await fetch(`${base}/config/providers`, { signal })).json() as { providers?: { id?: unknown }[]; default?: Record<string, unknown> };
    const provider = config.providers?.[0]?.id;
    const model = typeof provider === "string" ? config.default?.[provider] : undefined;
    return typeof model === "string" ? `${provider}/${model}` : undefined;
  }, options);
}

/** `opencode models`: one provider/model id a line; with --verbose each id is followed by its details as JSON */
export function parseOpenCodeModels(output: string): HarnessModelChoice[] {
  const entries: { id: string; details: string[] }[] = [];
  for (const line of output.split(/\r?\n/u)) {
    if (/^[\w.-]+\/\S+$/u.test(line.trim()) && !line.startsWith(" ")) entries.push({ id: line.trim(), details: [] });
    else if (line.trim() && entries.length) entries.at(-1)!.details.push(line);
    else if (line.trim()) throw new Error("OpenCode returned an invalid model catalog");
  }
  const choices = entries.map(({ id, details }) => {
    let model: { name?: unknown; providerID?: unknown; variants?: unknown } = {};
    if (details.length) {
      try { model = JSON.parse(details.join("\n")); } catch { throw new Error("OpenCode returned an invalid model catalog"); }
    }
    const efforts = model.variants && typeof model.variants === "object" ? Object.keys(model.variants) : [];
    return { id, name: typeof model.name === "string" ? model.name : id, ...(typeof model.providerID === "string" ? { description: model.providerID } : {}), efforts };
  });
  return choices.filter((choice, index) => choices.findIndex(other => other.id === choice.id) === index);
}

/** FX on Eve runs libfx in-process and has no catalog; the installed CLI lists its active provider's models. */
export async function fxModels(signal: AbortSignal, executable = resolveAgentExecutable("fx"), args = ["models", "--json"]): Promise<HarnessModelChoice[]> {
  if (!executable) return [];
  const { stdout } = await promisify(execFile)(executable, args, { signal, timeout: 15_000, maxBuffer: 1024 * 1024 });
  return parseFxModels(stdout);
}

/** Accepts only `fx models --json` output: an object whose `ids` is a list of non-empty strings. */
export function parseFxModels(output: string): HarnessModelChoice[] {
  let catalog: unknown;
  try { catalog = JSON.parse(output); } catch { throw new Error("FX returned an invalid model catalog"); }
  const ids = catalog && typeof catalog === "object" && "ids" in catalog ? catalog.ids : undefined;
  if (!Array.isArray(ids) || ids.some(id => typeof id !== "string" || !id.trim())) throw new Error("FX returned an invalid model catalog");
  return [...new Set(ids as string[])].map(id => ({ id, name: id, efforts: [] }));
}

/** Codex's app-server over stdio, initialised: its requests, its notifications, and `close`. `what` names the job in its errors. */
export async function codexAppServer(signal: AbortSignal, what: string, executable = resolveAgentExecutable("codex") ?? "codex",
  args = ["app-server", "--listen", "stdio://"]) {
  const child = spawn(executable, args, { stdio: ["pipe", "pipe", "ignore"] });
  const rpc = new JSONRPCClient(request => new Promise<void>((resolve, reject) => {
    child.stdin.write(`${JSON.stringify(request)}\n`, error => error ? reject(error) : resolve());
  }));
  const lines = createInterface({ input: child.stdout });
  const listeners = new Set<(method: string, params: unknown) => void>();
  let failure: Error | undefined;
  let end: (error: Error) => void = () => {};
  const ended = new Promise<Error>(resolve => { end = resolve; });
  const fail = (error: Error) => { failure ??= error; rpc.rejectAllPendingRequests(error.message); end(failure); };
  const abort = () => { fail(new Error(`${what} cancelled`)); child.kill(); };
  child.on("error", fail);
  child.stdin.on("error", fail);
  child.on("exit", () => fail(new Error(`Codex exited before ${what.charAt(0).toLowerCase()}${what.slice(1)} completed`)));
  lines.on("line", line => {
    let message: { method?: unknown; id?: unknown; params?: unknown };
    try { message = JSON.parse(line); }
    catch { fail(new Error("Codex returned an invalid app-server message")); return; }
    // A notification has a method and no id; everything else answers one of our requests
    if (typeof message.method === "string" && message.id === undefined) for (const listener of listeners) listener(message.method, message.params);
    else rpc.receive(message as never);
  });
  signal.addEventListener("abort", abort, { once: true });
  const request = async (method: string, params: unknown) => {
    signal.throwIfAborted();
    if (failure) throw failure;
    return rpc.timeout(10_000).request(method, params);
  };
  const close = () => {
    signal.removeEventListener("abort", abort);
    lines.close();
    rpc.rejectAllPendingRequests(`${what} finished`);
    child.stdin.end();
    child.kill();
  };
  try {
    await request("initialize", { clientInfo: { name: "dojofoo", version: "1.0.0" } });
    rpc.notify("initialized", undefined);
  } catch (error) {
    close();
    throw error;
  }
  return {
    request,
    /** Calls `listener` with each notification until `close`; returns its removal */
    onNotification(listener: (method: string, params: unknown) => void) { listeners.add(listener); return () => listeners.delete(listener); },
    /** Resolves with the error that ends the app-server: its exit, a broken message or the signal */
    ended,
    close,
  };
}

/** Native discovery only. This does not create a conversation or run inference. */
export async function codexModels(signal: AbortSignal, executable = resolveAgentExecutable("codex") ?? "codex", args = ["app-server", "--listen", "stdio://"]): Promise<HarnessModelChoice[]> {
  const server = await codexAppServer(signal, "Model discovery", executable, args);
  try {
    const choices: HarnessModelChoice[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await server.request("model/list", { ...(cursor ? { cursor } : {}), limit: 100 });
      if (!Array.isArray(page?.data)) throw new Error("Codex returned an invalid model catalog");
      for (const model of page.data) {
        if (typeof model.model !== "string" || typeof model.displayName !== "string") throw new Error("Codex returned an invalid model entry");
        choices.push({ id: model.model, name: model.displayName, ...(typeof model.description === "string" && model.description ? { description: model.description } : {}),
          efforts: (model.supportedReasoningEfforts ?? []).map((value: { reasoningEffort: string }) => value.reasoningEffort),
          defaultEffort: model.defaultReasoningEffort, ...(model.isDefault === true ? { default: true } : {}) });
      }
      cursor = page.nextCursor ?? undefined;
      if (cursor && (typeof cursor !== "string" || cursors.has(cursor))) throw new Error("Codex repeated its model catalog cursor");
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return choices;
  } finally {
    server.close();
  }
}

/** Pi's models of every provider it's signed in to, each with its provider's name. Sensei reads Pi's logins without writing them, so
 *  a login past (or within Pi's five minutes of) its expiry can't be renewed in a turn: its models are listed as needing a new sign-in.
 *  A signed-in provider's models its plan leaves out (GitHub Copilot's) are listed as not in the plan. */
export async function piModels(signal: AbortSignal, agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"),
  now = Date.now()): Promise<HarnessModelChoice[]> {
  const { ModelRuntime, readStoredCredential } = await import("@earendil-works/pi-coding-agent");
  const { getSupportedThinkingLevels } = await import("@earendil-works/pi-ai/models");
  const authPath = join(agentDir, "auth.json");
  const runtime = await ModelRuntime.create({ authPath, modelsPath: join(agentDir, "models.json"), allowModelNetwork: false, signal });
  if (runtime.getError()) throw new Error(runtime.getError());
  const available = runtime.getAvailableSnapshot();
  const providers = [...new Set(available.map(model => model.provider))];
  const providerName = (id: string) => runtime.getProvider(id)?.name ?? id;
  const lapsed = new Set(providers.filter(provider => {
    const credential = readStoredCredential(provider, authPath);
    return credential?.type === "oauth" && typeof credential.expires === "number" && credential.expires <= now + 5 * 60_000;
  }));
  const listed = new Set(available.map(model => `${model.provider}/${model.id}`));
  const choice = (model: (typeof available)[number], unavailable?: string): HarnessModelChoice => ({
    id: `${model.provider}/${model.id}`, name: model.name, description: providerName(model.provider),
    // Use the same capability resolver as Pi's own AgentSession. Custom
    // providers can advertise different levels; a reasoning boolean is not enough.
    efforts: getSupportedThinkingLevels(model),
    ...(unavailable ? { unavailable } : lapsed.has(model.provider) ? { unavailable: `Sign in to ${providerName(model.provider)} again`, signIn: model.provider } : {}),
  });
  return [...available.map(model => choice(model)), ...providers.flatMap(provider => runtime.getModels(provider)
    .filter(model => !listed.has(`${model.provider}/${model.id}`)).map(model => choice(model, `Not in your ${providerName(provider)} plan`)))];
}
