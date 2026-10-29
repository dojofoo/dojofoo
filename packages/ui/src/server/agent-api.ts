import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Client } from "@dojofoo/agent/client";
import { AgentApiError, createAgentApi, type Agent, type AgentRuntime, type AgentStatus, type SessionRecord } from "@dojofoo/agent-api";
import { resolveRuntimeHarness } from "@dojofoo/config/runtime";
import type { LocalStateOptions } from "@dojofoo/config/local-state";
import { KYOSHI_START } from "@dojofoo/authoring/eve/bootstrap";
import { resolveWorkspaceId } from "./control/workspace";

/** The coding agents Kyoshi's runtime has adapters for, as `dojofoo` names them. */
const codingAgents: Record<string, string> = { codex: "Codex", opencode: "OpenCode", pi: "Pi", cursor: "Cursor", grok: "Grok Build", fx: "FX" };

type RuntimeState = { status: AgentStatus; message?: string; client?: Promise<Client>; owned?: OwnedRuntime };

type OwnedRuntime = { start(): Promise<{ url: string; auth?: ConstructorParameters<typeof Client>[0]["auth"] }>; close(): Promise<void> };

/**
 * The agent API on this machine: each workspace runs its selected coding agent in a
 * local Eve process (shared with the legacy authoring routes), and keeps its session
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
  /** Start the workspace's agent once; later calls share the same start */
  const client = (path: string) => {
    const existing = states.get(path);
    if (existing?.client && existing.status !== "failed") return existing.client;
    const state: RuntimeState = { status: "starting" };
    states.set(path, state);
    state.client = (async () => {
      if (options.host) return new Client({ host: options.host });
      state.owned = await options.runtime(path);
      const { url, auth } = await state.owned.start();
      return new Client({ host: url, auth });
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
    state.client.catch(() => {});
    return state.client;
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

  return {
    async agents(workspaceId) {
      const path = root(workspaceId);
      const ids = [...new Set([selected(path), ...Object.keys(codingAgents)])];
      return ids.map(id => describe(path, id));
    },
    async start(workspaceId, agentId) {
      const path = root(workspaceId);
      known(path, agentId);
      void client(path);
      return describe(path, agentId);
    },
    async stop(workspaceId, agentId) {
      const path = root(workspaceId);
      known(path, agentId);
      const state = states.get(path);
      await state?.client?.catch(() => {});
      await state?.owned?.close();
      states.delete(path);
      return describe(path, agentId);
    },
    async connect(workspaceId, { agent, persona }) {
      const path = root(workspaceId);
      known(path, agent);
      if (persona !== "kyoshi") throw new AgentApiError(409, "persona_unavailable", "Sensei doesn't run on the agent runtime yet; lessons still use their own connection.");
      return client(path);
    },
    greeting: persona => persona === "kyoshi" ? KYOSHI_START : "",
    async context(workspaceId, _request, forwardedProps) {
      root(workspaceId);
      if (forwardedProps !== undefined && (!forwardedProps || typeof forwardedProps !== "object" || Array.isArray(forwardedProps))) {
        throw new AgentApiError(400, "invalid_context", "Page context must be a JSON object.");
      }
      return { ...forwardedProps, workspaceId };
    },
    sessions: {
      list: async workspaceId => read(root(workspaceId)),
      async get(workspaceId, sessionId) {
        const path = root(workspaceId);
        // Sessions started through the legacy authoring routes are Kyoshi's, on the selected agent.
        return (await read(path)).find(item => item.id === sessionId)
          ?? { id: sessionId, agent: selected(path), persona: "kyoshi", createdAt: new Date(0).toISOString() };
      },
      async save(workspaceId, session) {
        const path = root(workspaceId);
        const write = writing.then(async () => {
          const sessions = [...(await read(path)).filter(item => item.id !== session.id), session];
          await mkdir(dirname(file(path)), { recursive: true });
          const temporary = `${file(path)}.${process.pid}.tmp`;
          await writeFile(temporary, `${JSON.stringify({ sessions }, null, 2)}\n`);
          await rename(temporary, file(path));
        });
        writing = write.catch(() => {});
        await write;
      },
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
