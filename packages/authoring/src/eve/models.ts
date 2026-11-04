import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolveAgentExecutable } from "@dojofoo/config/agent-installations";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";
import { JSONRPCClient } from "json-rpc-2.0";
import { parse } from "smol-toml";
import { agentRow, type AgentId } from "@dojofoo/protocol";

/** Preserve the native CLI choice when the caller has not selected a model. */
export async function configuredHarnessModel(harness: string, codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex")): Promise<string | undefined> {
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

export interface HarnessModelChoice {
  id: string;
  name: string;
  efforts: string[];
  defaultEffort?: string;
}

export async function harnessModels(agent: AgentId, signal: AbortSignal): Promise<HarnessModelChoice[]> {
  const discovery = agentRow(agent).modelDiscovery;
  if (discovery?.method === "cli-aliases") return discovery.aliases.map(id => ({ id, name: id, efforts: [] }));
  // ACP probing (Cursor, Grok) lands in step 4; until then the agent's default model is used
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
