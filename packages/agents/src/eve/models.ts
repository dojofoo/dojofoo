import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolveAgentExecutable } from "@dojofoo/config/agent-installations";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { JSONRPCClient } from "json-rpc-2.0";
import { parse } from "smol-toml";
import { agentRow, type AgentId, type ModelChoice } from "@dojofoo/protocol";
import { readOnlyEnvironment } from "@dojofoo/harness/persona";

/** Preserve the native CLI choice when the caller has not selected a model. In-process libfx's own default belongs to the
 *  gateway and fails on a subscription login, so FX starts on the first model the user's CLI lists for its active provider. */
export async function configuredHarnessModel(harness: string, codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex"),
  listFx = () => fxModels(AbortSignal.timeout(15_000))): Promise<string | undefined> {
  if (harness === "fx") return (await listFx().catch(() => []))[0]?.id;
  if (harness !== "codex") return undefined;
  let source: string;
  try { source = await readFile(join(codexHome, "config.toml"), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const model = parse(source).model;
  return typeof model === "string" && model.trim() ? model : undefined;
}

/** Removed in step 7 with SessionModelConfiguration. */
export type HarnessModelChoice = ModelChoice;

export async function harnessModels(agent: AgentId, signal: AbortSignal): Promise<HarnessModelChoice[]> {
  const discovery = agentRow(agent).modelDiscovery;
  if (discovery?.method === "cli-aliases") return discovery.aliases.map(id => ({ id, name: id, efforts: [] }));
  if (discovery?.method === "acp-probe") return agent === "cursor" || agent === "grok" ? acpModels(agent, signal) : [];
  if (discovery?.method !== "native") return [];
  if (agent === "codex") return codexModels(signal);
  if (agent === "fx") return fxModels(signal);
  if (agent === "pi") return piModels(signal);
  if (agent === "opencode") {
    const executable = process.env.OPENCODE_BIN ?? resolveAgentExecutable("opencode") ?? "opencode";
    const { stdout } = await promisify(execFile)(executable, ["models"], { signal, timeout: 15_000, maxBuffer: 1024 * 1024 });
    return parseOpenCodeModels(stdout);
  }
  throw new Error(`${agentRow(agent).name} model discovery is not available here yet. Use its native CLI to select a model.`);
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

export function parseOpenCodeModels(output: string): HarnessModelChoice[] {
  const ids = output.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  if (ids.some(id => !/^[\w.-]+\/[^\s]+$/u.test(id))) throw new Error("OpenCode returned an invalid model catalog");
  return [...new Set(ids)].map(id => ({ id, name: id, efforts: [] }));
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

/** Native discovery only. This does not create a conversation or run inference. */
export async function codexModels(signal: AbortSignal, executable = resolveAgentExecutable("codex") ?? "codex", args = ["app-server", "--listen", "stdio://"]): Promise<HarnessModelChoice[]> {
  const child = spawn(executable, args, { stdio: ["pipe", "pipe", "ignore"] });
  const rpc = new JSONRPCClient(request => new Promise<void>((resolve, reject) => {
    child.stdin.write(`${JSON.stringify(request)}\n`, error => error ? reject(error) : resolve());
  }));
  const lines = createInterface({ input: child.stdout });
  let failure: Error | undefined;
  const fail = (error: Error) => { failure = error; rpc.rejectAllPendingRequests(error.message); };
  const abort = () => { fail(new Error("Model discovery cancelled")); child.kill(); };
  child.on("error", fail);
  child.stdin.on("error", fail);
  child.on("exit", () => fail(new Error("Codex exited before model discovery completed")));
  lines.on("line", line => {
    try { rpc.receive(JSON.parse(line)); }
    catch { fail(new Error("Codex returned an invalid app-server message")); }
  });
  signal.addEventListener("abort", abort, { once: true });
  const request = async (method: string, params: unknown) => {
    signal.throwIfAborted();
    if (failure) throw failure;
    return rpc.timeout(10_000).request(method, params);
  };
  try {
    await request("initialize", { clientInfo: { name: "dojofoo", version: "1.0.0" } });
    rpc.notify("initialized", undefined);
    const choices: HarnessModelChoice[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await request("model/list", { ...(cursor ? { cursor } : {}), limit: 100 });
      if (!Array.isArray(page?.data)) throw new Error("Codex returned an invalid model catalog");
      for (const model of page.data) {
        if (typeof model.model !== "string" || typeof model.displayName !== "string") throw new Error("Codex returned an invalid model entry");
        choices.push({ id: model.model, name: model.displayName,
          efforts: (model.supportedReasoningEfforts ?? []).map((value: { reasoningEffort: string }) => value.reasoningEffort),
          defaultEffort: model.defaultReasoningEffort });
      }
      cursor = page.nextCursor ?? undefined;
      if (cursor && (typeof cursor !== "string" || cursors.has(cursor))) throw new Error("Codex repeated its model catalog cursor");
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return choices;
  } finally {
    signal.removeEventListener("abort", abort);
    lines.close();
    rpc.rejectAllPendingRequests("Model discovery finished");
    child.stdin.end();
    child.kill();
  }
}

export async function piModels(signal: AbortSignal, agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent")): Promise<HarnessModelChoice[]> {
  const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
  const { getSupportedThinkingLevels } = await import("@earendil-works/pi-ai/models");
  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"),
    allowModelNetwork: false, signal,
  });
  if (runtime.getError()) throw new Error(runtime.getError());
  return runtime.getAvailableSnapshot().map(model => ({
    id: `${model.provider}/${model.id}`, name: model.name,
    // Use the same capability resolver as Pi's own AgentSession. Custom
    // providers can advertise different levels; a reasoning boolean is not enough.
    efforts: getSupportedThinkingLevels(model),
  }));
}
