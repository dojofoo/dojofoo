import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { ClientOptions } from "@dojofoo/agent/client";
import { AgentApiError, createAgentApi, type Agent, type AgentEndpoint, type AgentRuntime, type AgentStatus, type SessionRecord } from "@dojofoo/agent-api";
import { resolveRuntimeHarness } from "@dojofoo/config/runtime";
import type { LocalStateOptions } from "@dojofoo/config/local-state";
import { KYOSHI_START } from "@dojofoo/authoring/eve/bootstrap";
import { resolveWorkspaceId } from "./control/workspace";

/** The coding agents Kyoshi's runtime has adapters for, as `dojofoo` names them. */
const codingAgents: Record<string, string> = { claude: "Claude Code", codex: "Codex", opencode: "OpenCode", pi: "Pi", cursor: "Cursor", grok: "Grok Build", fx: "FX" };

type RuntimeState = { agent: string; status: AgentStatus; message?: string; endpoint?: Promise<AgentEndpoint>; owned?: OwnedRuntime };

type OwnedRuntime = { start(): Promise<{ url: string; auth?: ClientOptions["auth"]; exited?: Promise<unknown> }>; close(): Promise<void> };

/** The host's credentials as the header Eve's client would send */
function authorization(auth: ClientOptions["auth"]): Record<string, string> {
  if (!auth) return {};
  if ("basic" in auth && typeof auth.basic.password === "string") return { authorization: `Basic ${btoa(`${auth.basic.username}:${auth.basic.password}`)}` };
  if ("bearer" in auth && typeof auth.bearer === "string") return { authorization: `Bearer ${auth.bearer}` };
  throw new Error("The agent host's credentials can't be forwarded.");
}

/**
 * The agent API on this machine: each workspace runs its selected coding agent in a
 * local Eve process, and keeps its session
 * list next to its other `dojofoo` state in `.dojo/agent-sessions.json`.
 */
export function createLocalAgentRuntime(options: {
  runtime(root: string): Promise<OwnedRuntime>;
  /** An Eve host serving every workspace instead of local processes */
  host?: string;
  /** Where `dojofoo` keeps its registered workspaces (tests use a temporary one) */
  state?: LocalStateOptions;
}): AgentRuntime {
  const states = new Map<string, RuntimeState>();

  const root = (workspaceId: string) => {
    try { return resolveWorkspaceId(workspaceId, options.state); }
    catch { throw new AgentApiError(404, "workspace_not_found", "Workspace not found."); }
  };
  const selected = (path: string) => {
    const id = resolveRuntimeHarness("authoring", path);
    return id === "grok-build" ? "grok" : id;
  };
  const describe = (path: string, id: string): Agent => {
    const state = states.get(path);
    const current = id === selected(path);
    return {
      id, name: codingAgents[id] ?? id, selected: current,
      status: current && state ? state.status : "stopped",
      ...(current && state?.message ? { message: state.message } : {}),
    };
  };
  const known = (path: string, agentId: string) => {
    if (!codingAgents[agentId] && agentId !== selected(path)) throw new AgentApiError(404, "agent_not_found", "This workspace has no such coding agent.");
    if (agentId !== selected(path)) {
      throw new AgentApiError(409, "agent_unavailable", `${codingAgents[agentId] ?? agentId} isn't this workspace's selected coding agent. Select it for authoring to run it here.`);
    }
  };
  /** Start the workspace's agent once; later calls share the same start, until the agent changes or stops */
  const endpoint = (path: string) => {
    const existing = states.get(path);
    const agent = selected(path);
    if (existing?.endpoint && existing.status !== "failed" && existing.agent === agent) return existing.endpoint;
    const previous = existing?.owned;
    const state: RuntimeState = { agent, status: "starting" };
    states.set(path, state);
    state.endpoint = (async (): Promise<AgentEndpoint> => {
      // The running host was started for another coding agent
      await previous?.close();
      if (options.host) return { baseUrl: options.host };
      state.owned = await options.runtime(path);
      const { url, auth, exited } = await state.owned.start();
      // A host that exits on its own starts again on the next request
      void exited?.catch(() => {}).finally(() => { if (states.get(path) === state) states.delete(path); });
      return { baseUrl: url, headers: authorization(auth) };
    })().then(value => {
      state.status = "ready";
      return value;
    }, async error => {
      await state.owned?.close().catch(() => {});
      state.owned = undefined;
      state.status = "failed";
      state.message = error instanceof Error ? error.message : String(error);
      throw new AgentApiError(503, "agent_failed", `The coding agent could not start: ${state.message}`);
    });
    state.endpoint.catch(() => {});
    return state.endpoint;
  };

  const file = (path: string) => join(path, ".dojo", "agent-sessions.json");
  const read = async (path: string): Promise<SessionRecord[]> => {
    try { return (JSON.parse(await readFile(file(path), "utf8")) as { sessions: SessionRecord[] }).sessions; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  };
  let writing = Promise.resolve();
  const save = async (path: string, session: SessionRecord) => {
    const write = writing.then(async () => {
      const sessions = [...(await read(path)).filter(item => item.id !== session.id), session];
      await mkdir(dirname(file(path)), { recursive: true });
      const temporary = `${file(path)}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify({ sessions }, null, 2)}\n`);
      await rename(temporary, file(path));
    });
    writing = write.catch(() => {});
    await write;
  };

  return {
    async agents(workspaceId) {
      const path = root(workspaceId);
      const ids = [...new Set([selected(path), ...Object.keys(codingAgents)])];
      return ids.map(id => describe(path, id));
    },
    async start(workspaceId, agentId) {
      const path = root(workspaceId);
      known(path, agentId);
      void endpoint(path);
      return describe(path, agentId);
    },
    async stop(workspaceId, agentId) {
      const path = root(workspaceId);
      known(path, agentId);
      const state = states.get(path);
      await state?.endpoint?.catch(() => {});
      await state?.owned?.close();
      states.delete(path);
      return describe(path, agentId);
    },
    async connect(workspaceId, { agent, persona }) {
      const path = root(workspaceId);
      known(path, agent);
      if (persona !== "kyoshi") throw new AgentApiError(409, "persona_unavailable", "Sensei doesn't run on the agent runtime yet; lessons still use their own connection.");
      return endpoint(path);
    },
    greeting: persona => persona === "kyoshi" ? KYOSHI_START : "",
    sessions: {
      list: async workspaceId => read(root(workspaceId)),
      get: async (workspaceId, sessionId) => (await read(root(workspaceId))).find(item => item.id === sessionId),
      save: async (workspaceId, session) => save(root(workspaceId), session),
    },
  };
}

/** The versioned agent API, backed by this machine's workspaces. */
export const agentApi = createAgentApi(createLocalAgentRuntime({
  host: process.env.EVE_BASE_URL,
  runtime: root => {
    // Native Node loading keeps Eve's runtime and workers outside Vite's UI module graph.
    const load = createRequire(import.meta.url);
    const { acquireKyoshiRuntime } = load("@dojofoo/authoring/eve/runtime") as typeof import("@dojofoo/authoring/eve/runtime");
    return acquireKyoshiRuntime(root);
  },
}));
