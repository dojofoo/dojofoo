import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Client, ClientError, type ClientOptions } from "@dojofoo/agent/client";
import { setTimeout as delay } from "node:timers/promises";
import { AgentApiError, createAgentApi, type Agent, type AgentEndpoint, type AgentRuntime, type AgentStatus, type SessionRecord } from "@dojofoo/agent-api";
import { resolveAgent, writeAgent } from "@dojofoo/config/runtime";
import { agentRow, isAgentId, offeredAgents, personaForKind, type AgentId } from "@dojofoo/protocol";
import { listWorkspaces, type LocalStateOptions } from "@dojofoo/config/local-state";
import { KYOSHI_START } from "@dojofoo/authoring/eve/bootstrap";
import { resolveWorkspaceId } from "./control/workspace";
import { workspaceKind } from "./control/drafts";
import { authorizeLaunchRequest } from "./launch-token";

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
  /** How long a switch waits for the old agent's cancelled turns to settle (10 seconds) */
  switchSettleMs?: number;
}): AgentRuntime {
  const states = new Map<string, RuntimeState>();
  /** One agent switch at a time per workspace; starts and connects wait for it */
  const switching = new Map<string, Promise<unknown>>();

  const root = (workspaceId: string) => {
    try { return resolveWorkspaceId(workspaceId, options.state); }
    catch { throw new AgentApiError(404, "workspace_not_found", "Workspace not found."); }
  };
  const selected = (path: string) => resolveAgent(path);
  const describe = (path: string, id: AgentId): Agent => {
    const state = states.get(path);
    const current = id === selected(path);
    return {
      id, name: agentRow(id).name, selected: current,
      status: current && state ? state.status : "stopped",
      ...(current && state?.message ? { message: state.message } : {}),
    };
  };
  function known(path: string, agentId: string): asserts agentId is AgentId {
    if (!isAgentId(agentId)) throw new AgentApiError(404, "agent_not_found", "This workspace has no such coding agent.");
    if (agentId !== selected(path)) {
      throw new AgentApiError(409, "agent_unavailable", `${agentRow(agentId).name} isn't this workspace's selected coding agent. Select it for authoring to run it here.`);
    }
  }
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

  /** Whether a session still has a turn that started and has not settled; a paused turn is open */
  const turnOpen = async (client: Client, sessionId: string) => {
    try {
      const { events } = await client.sessions.attach(sessionId).snapshot({ signal: AbortSignal.timeout(2_000) });
      const open = new Set<string>();
      for (const event of events) {
        const turnId = (event.data as { turnId?: unknown } | undefined)?.turnId;
        if (typeof turnId !== "string") continue;
        if (event.type === "turn.started") open.add(turnId);
        else if (event.type === "turn.settled") open.delete(turnId);
      }
      return open.size > 0;
    } catch (error) {
      // An ended or expired session has no turn left to settle
      return !(error instanceof ClientError && (error.status === 409 || error.status === 410));
    }
  };
  /** Cancels the old agent's turns, waits a bounded time for them to settle, stops its host, then saves the new agent */
  const switchAgent = async (path: string, agentId: AgentId) => {
    const current = selected(path);
    if (agentId === current) return describe(path, agentId);
    const state = states.get(path);
    const endpoint = state?.endpoint && state.agent === current ? await state.endpoint.catch(() => undefined) : undefined;
    if (endpoint) {
      const client = new Client({ baseUrl: endpoint.baseUrl, headers: endpoint.headers });
      let pending = (await read(path)).filter(record => record.agent === current).map(record => record.id);
      // Without a turnId, Eve cancels whatever runs; an idle session takes it as a no-op
      await Promise.all(pending.map(id => client.sessions.attach(id).cancel({ signal: AbortSignal.timeout(5_000) }).catch(() => {})));
      const deadline = Date.now() + (options.switchSettleMs ?? 10_000);
      while (pending.length) {
        const open = await Promise.all(pending.map(id => turnOpen(client, id)));
        pending = pending.filter((_, index) => open[index]);
        const remaining = deadline - Date.now();
        if (!pending.length) break;
        if (remaining <= 0) {
          console.warn(`Switching to ${agentRow(agentId).name} without waiting longer for these sessions to stop: ${pending.join(", ")}`);
          break;
        }
        await delay(Math.min(250, remaining));
      }
    }
    await state?.owned?.close();
    states.delete(path);
    writeAgent(path, agentId);
    return describe(path, agentId);
  };

  return {
    async agents(workspaceId) {
      const path = root(workspaceId);
      const current = selected(path);
      return [current, ...offeredAgents().map(row => row.id).filter(id => id !== current)].map(id => describe(path, id));
    },
    async start(workspaceId, agentId) {
      const path = root(workspaceId);
      await switching.get(path)?.catch(() => {});
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
      await switching.get(path)?.catch(() => {});
      known(path, agent);
      if (persona !== "kyoshi") throw new AgentApiError(409, "persona_unavailable", "Sensei doesn't run on the agent runtime yet; lessons still use their own connection.");
      return endpoint(path);
    },
    async select(workspaceId, agentId) {
      const path = root(workspaceId);
      if (!isAgentId(agentId)) throw new AgentApiError(404, "agent_not_found", "This workspace has no such coding agent.");
      if (!offeredAgents().some(row => row.id === agentId)) {
        throw new AgentApiError(409, "agent_not_offered", `${agentRow(agentId).name} isn't available yet. Choose another coding agent.`);
      }
      if (agentId === selected(path)) return describe(path, agentId);
      const previous = switching.get(path) ?? Promise.resolve();
      const next = previous.catch(() => {}).then(() => switchAgent(path, agentId));
      switching.set(path, next);
      try { return await next; }
      finally { if (switching.get(path) === next) switching.delete(path); }
    },
    greeting: persona => persona === "kyoshi" ? KYOSHI_START : "",    async persona(workspaceId) {
      const workspace = listWorkspaces(options.state).find(item => item.id === workspaceId);
      if (!workspace) throw new AgentApiError(404, "workspace_not_found", "Workspace not found.");
      return personaForKind(workspaceKind(workspace, options.state ?? {}));
    },
    sessions: {
      list: async workspaceId => read(root(workspaceId)),
      get: async (workspaceId, sessionId) => (await read(root(workspaceId))).find(item => item.id === sessionId),
      save: async (workspaceId, session) => save(root(workspaceId), session),
    },
  };
}

/** The versioned agent API, backed by this machine's workspaces. Selecting an agent takes the page's launch token. */
export const agentApi = createAgentApi(createLocalAgentRuntime({
  host: process.env.EVE_BASE_URL,
  runtime: root => {
    // Native Node loading keeps Eve's runtime and workers outside Vite's UI module graph.
    const load = createRequire(import.meta.url);
    const { acquireKyoshiRuntime } = load("@dojofoo/authoring/eve/runtime") as typeof import("@dojofoo/authoring/eve/runtime");
    return acquireKyoshiRuntime(root);
  },
}), { authorize: authorizeLaunchRequest });
