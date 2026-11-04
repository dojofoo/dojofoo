import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { Client, ClientError, type ClientOptions } from "@dojofoo/agent/client";
import { activeTurn, emptySessionView, foldEvents } from "@dojofoo/agent/events";
import { setTimeout as delay } from "node:timers/promises";
import { AgentApiError, createAgentApi, type Agent, type AgentEndpoint, type AgentRuntime, type AgentStatus, type LifecycleStatus, type Persona } from "@dojofoo/agent-api";
import { resolveAgentExecutable } from "@dojofoo/config/agent-installations";
import { resolveAgent, writeAgent, writeAgentModel } from "@dojofoo/config/runtime";
import { agentRow, isAgentId, latestConformance, offeredAgents, personaForKind, type AgentId } from "@dojofoo/protocol";
import { listWorkspaces, localStateDirectory, type LocalStateOptions } from "@dojofoo/config/local-state";
import { reapProcessGroups } from "@dojofoo/agent/process-groups";
import { resolveWorkspaceId } from "./control/workspace";
import { workspaceKind } from "./control/drafts";
import { authorizeLaunchRequest } from "./launch-token";
import { readRecords as read, saveRecord as save, updateRecord } from "./agent-session/records";
import { afterDelivery, applyLifecycle, beforeDelivery } from "./agent-session/lifecycle";
import { createDefaultSessions } from "./agent-session/default";
import { sendHeld } from "./agent-session/check-reports";
import { discardWindow, guardedLesson, openWindow, verifyRecords, verifyWindow } from "./agent-session/guard";
import { dropHeld } from "./agent-session/report-state";
import { startupVerified } from "./startup";
import { authoringWatchers } from "./authoring-watch";
import { committedConformance } from "./conformance";
import { forgetHost, hostPortUrl, registerHost, runningHost } from "./host-port";
import { presence as pageHub } from "./agent-session/presence";
import { pageKeyOf, type PageKey } from "./agent-session/notify";

type RuntimeState = {
  agent: string; persona: Persona; workspaceId: string; status: AgentStatus; message?: string;
  endpoint?: Promise<AgentEndpoint>; owned?: OwnedRuntime; secret?: string;
};

/** What `deliveries.before` hands to `after`: the status before the delivery, and the guard window it opened */
type DeliveryHandle = { before: LifecycleStatus; opened?: string };

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
  /** How long a switch allows the old host to stop; a waiter gives up after switchSettleMs + hostStopMs (10 seconds) */
  hostStopMs?: number;
  /** How long a host may go unused before it stops (15 minutes) */
  idleStopMs?: number;
  /** How often idle hosts are looked for (60 seconds; tests use less) */
  idleCheckMs?: number;
}): AgentRuntime {
  const states = new Map<string, RuntimeState>();
  const pages = () => pageHub();
  /** Presence for idle stop: the proxied streams still open per workspace, and since when a ready host has had nothing using it */
  const presence = new Map<string, { streams: number }>();
  const idleSince = new Map<string, number>();
  /** One agent switch at a time per workspace, and the agent it switches to; starts, connects and deliveries wait for it, bounded */
  const switching = new Map<string, { done: Promise<unknown>; agent: AgentId }>();
  const switchBoundMs = (options.switchSettleMs ?? 10_000) + (options.hostStopMs ?? 10_000);
  /** Waits for a switch in progress at most its bound, then answers 409 agent_switching (D33) */
  const waitForSwitch = async (path: string) => {
    const current = switching.get(path);
    if (!current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = await Promise.race([
      current.done.then(() => false, () => false),
      new Promise<boolean>(accept => { timer = setTimeout(() => accept(true), switchBoundMs); }),
    ]).finally(() => clearTimeout(timer));
    if (timedOut) throw new AgentApiError(409, "agent_switching", `Switching to ${agentRow(current.agent).name}…`);
  };

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
  /** Before any host stops (switch, switch timeout, crash, idle stop, stop): verify its sessions' windows, drop their held reports */
  const beforeHostStop = async (path: string, workspaceId: string, agent: string) => {
    const records = (await read(path)).filter(record => record.agent === agent);
    pageHub().clearTimers(records.flatMap(record => pageKeyOf(workspaceId, record) ?? []));
    await verifyRecords(path, workspaceId, records);
    for (const record of records) await dropHeld(path, workspaceId, record.id).catch(() => undefined);
  };
  /** Stops a host and withdraws its host-port secret */
  const closeState = async (path: string, state: RuntimeState | undefined) => {
    if (!state) return;
    forgetHost(state.workspaceId, state.persona, state.secret);
    await beforeHostStop(path, state.workspaceId, state.agent).catch(error => console.warn(`Could not verify the windows of ${path}: ${error instanceof Error ? error.message : String(error)}`));
    await state.owned?.close();
  };
  /** Records left working or paused with no open turn in Eve (a crash, a missed hook) settle when the host is ready: their windows
   *  are verified, then their held reports go out or are dropped under D16. An interrupted record stays as it is. */
  const reconcile = async (path: string, workspaceId: string, agent: string, ready: AgentEndpoint) => {
    const client = new Client({ baseUrl: ready.baseUrl, headers: ready.headers });
    const open = (await read(path)).filter(record => record.agent === agent
      && (record.lifecycle?.status === "working" || record.lifecycle?.status === "paused"));
    await Promise.all(open.map(async record => {
      if ((await activeTurnOf(client, record.id)).open) return;
      await verifyWindow(path, workspaceId, record.id);
      await applyLifecycle(path, record.id, { type: "reconcile" });
      await sendHeld(path, workspaceId, ready, record.id);
    }));
  };
  /** Startup step 4: a recovery window for each of this agent's kata sessions Eve may recover without the pre-delivery hook */
  const recoveryWindows = async (path: string, workspaceId: string, agent: string) => {
    for (const record of await read(path)) {
      if (record.agent !== agent || record.lifecycle?.status !== "working" || !guardedLesson(path, record)) continue;
      await openWindow(path, workspaceId, record).catch(error => console.warn(`Could not open a recovery window for ${record.id}: ${error instanceof Error ? error.message : String(error)}`));
    }
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
      await closeState(path, previous);
      // No host starts before startup has verified the persisted windows (startup step 3)
      await startupVerified();
      if (persona === "sensei") await recoveryWindows(path, workspaceId, agent);
      state.owned = await options.runtime(path, { persona, workspaceId, hostPortUrl: hostPortUrl() });
      const { url, auth, exited, secret } = await state.owned.start();
      const ready = { baseUrl: url, headers: authorization(auth) };
      if (secret) {
        state.secret = secret;
        registerHost(workspaceId, persona, { secret, endpoint: ready, agent: agent as AgentId, openDefault: request => runtime.sessions.openDefault(workspaceId, request) });
      }
      // A host that exits on its own starts again on the next request, once its windows are verified
      void exited?.catch(() => {}).finally(async () => {
        forgetHost(workspaceId, persona, secret);
        if (states.get(path) === state) states.delete(path);
        await beforeHostStop(path, workspaceId, agent).catch(() => undefined);
      });
      await reconcile(path, workspaceId, agent, ready).catch(error => console.warn(`Could not reconcile the sessions of ${path}: ${error instanceof Error ? error.message : String(error)}`));
      // Startup step 5: a paused conversation whose page has no socket is left 30 seconds after its host is ready
      if (persona === "sensei") for (const record of await read(path).catch(() => [])) {
        const key = record.agent === agent && record.lifecycle?.status === "paused" ? pageKeyOf(workspaceId, record) : undefined;
        if (key) pageHub().armIfAbsent(key);
      }
      return ready;
    })().then(value => {
      state.status = "ready";
      presence.set(path, { streams: presence.get(path)?.streams ?? 0 });
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

  /** Whether a session still has a turn that started and has not settled (a paused turn is open), and that turn's id */
  const activeTurnOf = async (client: Client, sessionId: string): Promise<{ open: boolean; turnId?: string }> => {
    try {
      const { events } = await client.sessions.attach(sessionId).snapshot({ signal: AbortSignal.timeout(2_000) });
      const turn = activeTurn(foldEvents(emptySessionView(), events));
      return turn ? { open: true, turnId: turn.turnId } : { open: false };
    } catch (error) {
      // An ended or expired session has no turn left to settle
      return { open: !(error instanceof ClientError && (error.status === 409 || error.status === 410)) };
    }
  };
  const processRecord = (workspaceId: string, persona: Persona) => join(localStateDirectory(options.state), "processes", `${workspaceId}.${persona}.jsonl`);
  /** Holding the switch lock: drop the workspace's held reports; cancel the old agent's turns (a paused one by its turnId) and wait a
   *  bounded time for them to settle; mark those still open interrupted; verify the remaining windows; stop the old host and reap its
   *  process groups; then save the new agent (design, "Workspace agent selection") */
  const switchAgent = async (path: string, workspaceId: string, agentId: AgentId) => {
    const current = selected(path);
    if (agentId === current) return describe(path, agentId);
    const records = await read(path);
    for (const record of records) await dropHeld(path, workspaceId, record.id).catch(() => undefined);
    const state = states.get(path);
    const endpoint = state?.endpoint && state.agent === current ? await state.endpoint.catch(() => undefined) : undefined;
    const old = records.filter(record => record.agent === current);
    if (endpoint) {
      const client = new Client({ baseUrl: endpoint.baseUrl, headers: endpoint.headers });
      // Without a turnId, Eve cancels whatever runs; an idle session takes it as a no-op
      await Promise.all(old.map(record => client.sessions.attach(record.id).cancel({
        ...(record.lifecycle?.status === "paused" && record.lifecycle.turnId ? { turnId: record.lifecycle.turnId } : {}),
        signal: AbortSignal.timeout(5_000),
      }).catch(() => {})));
      let pending = old.map(record => record.id);
      const openTurns = new Map<string, string | undefined>();
      const deadline = Date.now() + (options.switchSettleMs ?? 10_000);
      while (pending.length) {
        const turns = await Promise.all(pending.map(id => activeTurnOf(client, id)));
        turns.forEach((turn, index) => openTurns.set(pending[index]!, turn.turnId));
        pending = pending.filter((_, index) => turns[index]!.open);
        const remaining = deadline - Date.now();
        if (!pending.length) break;
        if (remaining <= 0) {
          console.warn(`Switching to ${agentRow(agentId).name} without waiting longer for these sessions to stop: ${pending.join(", ")}`);
          // No host recovers these turns: each is marked interrupted with its open turn, and its window is closed (CUJ 3)
          for (const id of pending) {
            await applyLifecycle(path, id, { type: "switch-timeout", ...(openTurns.get(id) ? { turnId: openTurns.get(id)! } : {}) });
            await verifyWindow(path, workspaceId, id);
          }
          break;
        }
        await delay(Math.min(250, remaining));
      }
    }
    await closeState(path, state);
    states.delete(path);
    if (state) reapProcessGroups(processRecord(state.workspaceId, state.persona));
    writeAgent(path, agentId);
    return describe(path, agentId);
  };

  /** A ready host is idle with no open proxied stream, no authoring watcher and no turn in progress; it stops after the idle bound,
   *  counted from the moment it became idle */
  const idleStopMs = options.idleStopMs ?? 15 * 60_000;
  const stopIdle = async () => {
    for (const [path, state] of [...states]) {
      if (state.status !== "ready") continue;
      const busy = (presence.get(path)?.streams ?? 0) > 0 || authoringWatchers.watching(path) || pages().sockets(state.workspaceId) > 0
        || (await read(path)).some(record => record.agent === state.agent && (record.lifecycle?.status === "working" || record.lifecycle?.status === "paused"));
      if (busy) { idleSince.delete(path); continue; }
      const since = idleSince.get(path) ?? Date.now();
      idleSince.set(path, since);
      if (Date.now() - since < idleStopMs || states.get(path) !== state) continue;
      states.delete(path);
      idleSince.delete(path);
      await closeState(path, state).catch(error => console.warn(`Could not stop the idle host of ${path}: ${error instanceof Error ? error.message : String(error)}`));
    }
  };
  setInterval(() => { void stopIdle().catch(() => {}); }, options.idleCheckMs ?? 60_000).unref();

  /** D19: leaving a page cancels its paused turn (by turnId) and its working begin; the leave transition comes first, so the held report
   *  is dropped before Eve's cancel. Evaluation-trial workspaces are never left; an ordinary working turn runs until it settles. */
  const leavePage = async (key: PageKey) => {
    let path: string;
    try { path = root(key.workspaceId); } catch { return; }
    const workspace = listWorkspaces(options.state).find(item => item.id === key.workspaceId);
    if (!workspace || workspaceKind(workspace, options.state ?? {}) === "evaluation-trial") return;
    const agent = selected(path);
    for (const record of await read(path)) {
      if (record.persona !== "sensei" || record.agent !== agent || record.endedAt || record.courseId !== key.courseId || (record.lessonId ?? "") !== (key.lessonId ?? "")) continue;
      const status = record.lifecycle?.status;
      if (status !== "paused" && !(status === "working" && record.lifecycle?.beginPending)) continue;
      await dropHeld(path, key.workspaceId, record.id);
      await applyLifecycle(path, record.id, { type: "leave" });
      await runtime.cancelTurn!(key.workspaceId, record.id, status === "paused" ? record.lifecycle?.turnId : undefined);
    }
  };
  /** Kyoshi's leave rule: 30 seconds after a draft's last authoring socket closed, its paused turns are cancelled by turnId (D27 evicts) */
  const leaveDraft = async (folder: string) => {
    for (const [path, state] of states) {
      let same = false;
      try { same = realpathSync(path) === folder; } catch {}
      if (!same || state.persona !== "kyoshi") continue;
      for (const record of await read(path)) {
        if (record.persona !== "kyoshi" || record.agent !== state.agent || record.lifecycle?.status !== "paused") continue;
        await applyLifecycle(path, record.id, { type: "leave" });
        await runtime.cancelTurn!(state.workspaceId, record.id, record.lifecycle.turnId);
      }
    }
  };

  const runtime: AgentRuntime = {
    /** Eve's cancel through the running host of the record's persona; nothing when no host runs */
    async cancelTurn(workspaceId, sessionId, turnId) {
      const path = root(workspaceId);
      const record = (await read(path)).find(item => item.id === sessionId);
      const host = record ? runningHost(workspaceId, record.persona) : undefined;
      if (!host) return;
      await new Client({ baseUrl: host.endpoint.baseUrl, headers: host.endpoint.headers }).sessions.attach(sessionId)
        .cancel({ ...(turnId ? { turnId } : {}), signal: AbortSignal.timeout(5_000) })
        .catch(error => console.warn(`Could not cancel the turn of ${sessionId}: ${error instanceof Error ? error.message : String(error)}`));
    },
    async agents(workspaceId) {
      const path = root(workspaceId);
      const current = selected(path);
      return [current, ...offeredAgents().map(row => row.id).filter(id => id !== current)].map(id => describe(path, id));
    },
    async start(workspaceId, agentId) {
      const path = root(workspaceId);
      await waitForSwitch(path);
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
      await closeState(path, state);
      states.delete(path);
      return describe(path, agentId);
    },
    async connect(workspaceId, { agent }) {
      const path = root(workspaceId);
      await waitForSwitch(path);
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
      // A learner workspace's every page now runs Sensei on Eve, so its selection refuses Cursor too (decision 11)
      if (senseiRefusesCursor(agentId) && await workspacePersona(workspaceId) === "sensei") throw new AgentApiError(409, "agent_not_offered", cursorRefusal);
      if (agentId === selected(path)) return describe(path, agentId);
      const previous = switching.get(path)?.done ?? Promise.resolve();
      const next = previous.catch(() => {}).then(() => switchAgent(path, workspaceId, agentId));
      const entry = { done: next, agent: agentId };
      switching.set(path, entry);
      try { return await next; }
      finally { if (switching.get(path) === entry) switching.delete(path); }
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
      // Rule 1: the guard window opens before the delivery can start or resume Sensei's model
      before: async (workspaceId, session): Promise<DeliveryHandle> => {
        const path = root(workspaceId);
        await waitForSwitch(path);
        const opened = await openWindow(path, workspaceId, session);
        return { before: await beforeDelivery(path, session.id), ...(opened ? { opened } : {}) };
      },
      after: async (workspaceId, session, _delivery, outcome) => {
        if (outcome.status >= 200 && outcome.status < 300) return;
        const path = root(workspaceId);
        const handle = (outcome.handle ?? {}) as Partial<DeliveryHandle>;
        // Rule 2: only the window this delivery opened goes; one it joined belongs to the running turn
        await discardWindow(path, handle.opened);
        const restored = await afterDelivery(path, session.id, handle.before, outcome.status);
        const ready = states.get(path)?.endpoint;
        if (restored?.lifecycle?.status === "idle" && ready) await sendHeld(path, workspaceId, await ready, session.id).catch(() => undefined);
      },
    },
    // Only open streams count (the proxied-request presence of step 4 is gone; page sockets count from commit 8)
    activity(workspaceId, kind) {
      if (kind !== "stream") return () => {};
      const path = root(workspaceId);
      const seen = presence.get(path) ?? { streams: 0 };
      presence.set(path, seen);
      seen.streams++;
      idleSince.delete(path);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        seen.streams--;
      };
    },
  };
  const openDefault = createDefaultSessions({
    root, persona: workspacePersona, selected,
    connect: (workspaceId, target) => runtime.connect(workspaceId, target),
    refuses: agent => senseiRefusesCursor(agent) ? cursorRefusal : undefined,
  });
  runtime.sessions.openDefault = openDefault;
  pages().onLeave(leavePage);
  authoringWatchers.onLeft(leaveDraft);
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
