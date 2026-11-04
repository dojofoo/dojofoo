import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Client, ClientError, type ClientOptions } from "@dojofoo/agent/client";
import { activeTurn, emptySessionView, foldEvents } from "@dojofoo/agent/events";
import { setTimeout as delay } from "node:timers/promises";
import { AgentApiError, createAgentApi, type Agent, type AgentEndpoint, type AgentRuntime, type AgentStatus, type Persona } from "@dojofoo/agent-api";
import { resolveAgentExecutable } from "@dojofoo/config/agent-installations";
import { resolveAgent, writeAgent, writeAgentModel } from "@dojofoo/config/runtime";
import { agentRow, isAgentId, latestConformance, offeredAgents, personaForKind, type AgentId } from "@dojofoo/protocol";
import { listWorkspaces, type LocalStateOptions } from "@dojofoo/config/local-state";
import { resolveWorkspaceId } from "./control/workspace";
import { workspaceKind } from "./control/drafts";
import { authorizeLaunchRequest } from "./launch-token";
import { readRecords as read, saveRecord as save, updateRecord } from "./agent-session/records";
import { afterDelivery, applyLifecycle, beforeDelivery } from "./agent-session/lifecycle";
import { createDefaultSessions } from "./agent-session/default";
import { authoringWatchers } from "./authoring-watch";
import { committedConformance } from "./conformance";
import { forgetHost, hostPortUrl, registerHost } from "./host-port";

type RuntimeState = {
  agent: string; persona: Persona; workspaceId: string; status: AgentStatus; message?: string;
  endpoint?: Promise<AgentEndpoint>; owned?: OwnedRuntime; secret?: string;
};

type OwnedRuntime = { start(): Promise<{ url: string; auth?: ClientOptions["auth"]; secret?: string; exited?: Promise<unknown> }>; close(): Promise<void> };
/** Which host a start is for: the persona the workspace's kind runs, and where its host port listens */
export type RuntimeTarget = { persona: Persona; workspaceId: string; hostPortUrl: string };

/** Interactive Sensei refuses Cursor until a passing Sensei conformance record exists (step-4 plan, decision 19; fail closed). */
export function senseiRefusesCursor(agent: string): boolean {
  return agent === "cursor" && latestConformance(committedConformance(), "cursor")?.personas.sensei !== "pass";
}
export const cursorRefusal = "Cursor can't teach here yet: its Sensei checks haven't passed. Choose another coding agent.";

/** The agent saved in `.dojo/runtimes.json`, as written, even when it is no longer offered. */
function savedSelection(path: string): string | undefined {
  const file = resolve(path, ".dojo", "runtimes.json");
  if (!existsSync(file)) return undefined;
  try {
    const { agent } = JSON.parse(readFileSync(file, "utf8")) as { agent?: unknown };
    return typeof agent === "string" ? agent : undefined;
  } catch { return undefined; }
}

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
  runtime(root: string, target: RuntimeTarget): Promise<OwnedRuntime>;
  /** Where `dojofoo` keeps its registered workspaces (tests use a temporary one) */
  state?: LocalStateOptions;
  /** How long a switch waits for the old agent's cancelled turns to settle (10 seconds) */
  switchSettleMs?: number;
  /** How long a host may go unused before it stops (15 minutes) */
  idleStopMs?: number;
  /** How often idle hosts are looked for (60 seconds; tests use less) */
  idleCheckMs?: number;
}): AgentRuntime {
  const states = new Map<string, RuntimeState>();
  /** Presence for idle stop: the last proxied request and the proxied streams still open, per workspace */
  const presence = new Map<string, { last: number; streams: number }>();
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
  /** A saved agent that is no longer offered, or Cursor without its CLI, can't start (decision 7) */
  function offered(path: string, agentId: AgentId) {
    const saved = savedSelection(path);
    if (saved !== undefined && (!isAgentId(saved) || !offeredAgents().some(row => row.id === saved))) {
      throw new AgentApiError(409, "agent_not_offered", `${isAgentId(saved) ? agentRow(saved).name : saved} isn't available yet. Choose another coding agent.`);
    }
    if (agentId === "cursor" && !resolveAgentExecutable("cursor")) {
      throw new AgentApiError(409, "agent_not_offered", "Cursor's CLI (cursor-agent) isn't installed. Install it or choose another coding agent.");
    }
  }
  const workspacePersona = async (workspaceId: string): Promise<Persona> => {
    const workspace = listWorkspaces(options.state).find(item => item.id === workspaceId);
    if (!workspace) throw new AgentApiError(404, "workspace_not_found", "Workspace not found.");
    return personaForKind(workspaceKind(workspace, options.state ?? {}));
  };
  /** Stops a host and withdraws its host-port secret */
  const closeState = async (state: RuntimeState | undefined) => {
    if (!state) return;
    forgetHost(state.workspaceId, state.persona, state.secret);
    await state.owned?.close();
  };
  /** Records left working or paused with no open turn in Eve (a crash, a missed hook) settle when the host is ready */
  const reconcile = async (path: string, agent: string, ready: AgentEndpoint) => {
    const client = new Client({ baseUrl: ready.baseUrl, headers: ready.headers });
    const open = (await read(path)).filter(record => record.agent === agent
      && (record.lifecycle?.status === "working" || record.lifecycle?.status === "paused"));
    await Promise.all(open.map(async record => {
      if (!await turnOpen(client, record.id)) await applyLifecycle(path, record.id, { type: "reconcile" });
    }));
  };
  /** Start the workspace's agent once; later calls share the same start, until the agent changes or stops */
  const endpoint = (path: string, workspaceId: string, persona: Persona) => {
    const existing = states.get(path);
    const agent = selected(path);
    if (existing?.endpoint && existing.status !== "failed" && existing.agent === agent && existing.persona === persona) return existing.endpoint;
    const previous = existing;
    const state: RuntimeState = { agent, persona, workspaceId, status: "starting" };
    states.set(path, state);
    state.endpoint = (async (): Promise<AgentEndpoint> => {
      // The running host was started for another coding agent
      await closeState(previous);
      state.owned = await options.runtime(path, { persona, workspaceId, hostPortUrl: hostPortUrl() });
      const { url, auth, exited, secret } = await state.owned.start();
      const ready = { baseUrl: url, headers: authorization(auth) };
      if (secret) {
        state.secret = secret;
        registerHost(workspaceId, persona, { secret, endpoint: ready });
      }
      // A host that exits on its own starts again on the next request
      void exited?.catch(() => {}).finally(() => {
        forgetHost(workspaceId, persona, secret);
        if (states.get(path) === state) states.delete(path);
      });
      await reconcile(path, agent, ready).catch(error => console.warn(`Could not reconcile the sessions of ${path}: ${error instanceof Error ? error.message : String(error)}`));
      return ready;
    })().then(value => {
      state.status = "ready";
      presence.set(path, { last: Date.now(), streams: presence.get(path)?.streams ?? 0 });
      return value;
    }, async error => {
      forgetHost(workspaceId, persona, state.secret);
      await state.owned?.close().catch(() => {});
      state.owned = undefined;
      state.status = "failed";
      state.message = error instanceof Error ? error.message : String(error);
      throw new AgentApiError(503, "agent_failed", `The coding agent could not start: ${state.message}`);
    });
    state.endpoint.catch(() => {});
    return state.endpoint;
  };

  /** Whether a session still has a turn that started and has not settled; a paused turn is open */
  const turnOpen = async (client: Client, sessionId: string) => {
    try {
      const { events } = await client.sessions.attach(sessionId).snapshot({ signal: AbortSignal.timeout(2_000) });
      return activeTurn(foldEvents(emptySessionView(), events)) !== undefined;
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
    await closeState(state);
    states.delete(path);
    writeAgent(path, agentId);
    return describe(path, agentId);
  };

  /** A host is idle without proxied requests for the idle bound, open streams, an authoring watcher, or a turn in progress */
  const idleStopMs = options.idleStopMs ?? 15 * 60_000;
  const stopIdle = async () => {
    for (const [path, state] of [...states]) {
      if (state.status !== "ready") continue;
      const seen = presence.get(path);
      if (!seen || seen.streams > 0 || Date.now() - seen.last < idleStopMs || authoringWatchers.watching(path)) continue;
      const busy = (await read(path)).some(record => record.agent === state.agent
        && (record.lifecycle?.status === "working" || record.lifecycle?.status === "paused"));
      if (busy || states.get(path) !== state) continue;
      states.delete(path);
      await closeState(state).catch(error => console.warn(`Could not stop the idle host of ${path}: ${error instanceof Error ? error.message : String(error)}`));
    }
  };
  setInterval(() => { void stopIdle().catch(() => {}); }, options.idleCheckMs ?? 60_000).unref();

  const runtime: AgentRuntime = {
    async agents(workspaceId) {
      const path = root(workspaceId);
      const current = selected(path);
      return [current, ...offeredAgents().map(row => row.id).filter(id => id !== current)].map(id => describe(path, id));
    },
    async start(workspaceId, agentId) {
      const path = root(workspaceId);
      await switching.get(path)?.catch(() => {});
      known(path, agentId);
      const persona = await workspacePersona(workspaceId);
      if (persona === "sensei" && senseiRefusesCursor(agentId)) throw new AgentApiError(409, "agent_not_offered", cursorRefusal);
      offered(path, agentId);
      void endpoint(path, workspaceId, persona).catch(() => {});
      return describe(path, agentId);
    },
    async stop(workspaceId, agentId) {
      const path = root(workspaceId);
      known(path, agentId);
      const state = states.get(path);
      await state?.endpoint?.catch(() => {});
      await closeState(state);
      states.delete(path);
      return describe(path, agentId);
    },
    async connect(workspaceId, { agent }) {
      const path = root(workspaceId);
      await switching.get(path)?.catch(() => {});
      known(path, agent);
      // The workspace's kind decides who speaks: a draft runs Kyoshi, every other workspace Sensei
      const persona = await workspacePersona(workspaceId);
      if (persona === "sensei" && senseiRefusesCursor(agent)) throw new AgentApiError(409, "agent_not_offered", cursorRefusal);
      offered(path, agent);
      return endpoint(path, workspaceId, persona);
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
    persona: workspacePersona,
    async models(workspaceId, agentId) {
      root(workspaceId);
      if (!isAgentId(agentId)) throw new AgentApiError(404, "agent_not_found", "This workspace has no such coding agent.");
      const { harnessModels } = createRequire(import.meta.url)("@dojofoo/authoring/eve/models") as typeof import("@dojofoo/authoring/eve/models");
      try { return await harnessModels(agentId, AbortSignal.timeout(20_000)); }
      catch (error) { throw new AgentApiError(502, "models_unavailable", error instanceof Error ? error.message : String(error)); }
    },
    sessions: {
      list: async workspaceId => read(root(workspaceId)),
      get: async (workspaceId, sessionId) => (await read(root(workspaceId))).find(item => item.id === sessionId),
      save: async (workspaceId, session) => save(root(workspaceId), session),
      update: async (workspaceId, sessionId, change) => updateRecord(root(workspaceId), sessionId, change),
      // Assigned below, once the runtime it connects through exists
      openDefault: async () => { throw new Error("openDefault is not ready"); },
      async patch(workspaceId, sessionId, { model }) {
        const path = root(workspaceId);
        const updated = await updateRecord(path, sessionId, record => {
          if (record.lifecycle?.status === "paused") throw new AgentApiError(409, "turn_paused", "Change the model after Sensei's question is answered.");
          return { ...record, model, revision: record.revision + 1 };
        });
        // The workspace's last model for this agent, for its next new conversation (D26)
        if (isAgentId(updated.agent)) writeAgentModel(path, updated.agent, model);
        return updated;
      },
    },
    deliveries: {
      before: async (workspaceId, session) => beforeDelivery(root(workspaceId), session.id),
      after: async (workspaceId, session, _delivery, outcome) => afterDelivery(root(workspaceId), session.id, outcome.handle, outcome.status),
    },
    activity(workspaceId, kind) {
      const path = root(workspaceId);
      const seen = presence.get(path) ?? { last: Date.now(), streams: 0 };
      presence.set(path, seen);
      seen.last = Date.now();
      if (kind === "stream") seen.streams++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (kind === "stream") seen.streams--;
        seen.last = Date.now();
      };
    },
  };
  const openDefault = createDefaultSessions({
    root, persona: workspacePersona, selected,
    connect: (workspaceId, target) => runtime.connect(workspaceId, target),
    refuses: agent => senseiRefusesCursor(agent) ? cursorRefusal : undefined,
  });
  runtime.sessions.openDefault = openDefault;
  return runtime;
}

/** This machine's agent runtime: Kyoshi hosts for drafts, Sensei hosts for every other workspace. */
export const localAgentRuntime = createLocalAgentRuntime({
  runtime: (root, target) => {
    // Native Node loading keeps Eve's runtime and workers outside Vite's UI module graph.
    const load = createRequire(import.meta.url);
    if (target.persona === "kyoshi") {
      const { acquireKyoshiRuntime } = load("@dojofoo/authoring/eve/runtime") as typeof import("@dojofoo/authoring/eve/runtime");
      return acquireKyoshiRuntime(root, target);
    }
    const { acquireSenseiRuntime } = load("@dojofoo/authoring/sensei/runtime") as typeof import("@dojofoo/authoring/sensei/runtime");
    return acquireSenseiRuntime(root, target);
  },
});

/** The versioned agent API, backed by this machine's workspaces. Selecting an agent takes the page's launch token. */
export const agentApi = createAgentApi(localAgentRuntime, { authorize: authorizeLaunchRequest });
