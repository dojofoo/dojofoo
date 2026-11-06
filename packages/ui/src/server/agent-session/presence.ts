import { notification } from "../session/protocol";
import { setPageSink, type PageKey } from "./notify";

/** A page socket as the hub keeps it: what it sends to and how it is told apart */
export interface PresencePeer { id: string; send(data: string): unknown }
/** Leaves a page: cancels its paused turn and its working begin (D19), on the selected agent */
export type LeaveHandler = (key: PageKey) => Promise<void>;

const keyOf = (key: PageKey) => `${key.workspaceId}\0${key.courseId}\0${key.lessonId ?? ""}`;
const parse = (id: string): PageKey => {
  const [workspaceId, courseId, lessonId] = id.split("\0") as [string, string, string];
  return { workspaceId, courseId, ...(lessonId ? { lessonId } : {}) };
};

/** One page socket hub per process (step-5 plan, "Presence and leaving"): peers per page key, the 30-second leave timers, and the
 *  sink every page notification goes through. Two tabs on one page are one page; a socket that opens for another page key of the
 *  workspace leaves the others at once. */
export function createPresenceHub(options: { leaveAfterMs?: number } = {}) {
  const leaveAfterMs = options.leaveAfterMs ?? 30_000;
  const peers = new Map<string, Map<string, PresencePeer>>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Page keys that may have something to leave: every key seen since the process started, per workspace */
  const known = new Map<string, Set<string>>();
  let onLeave: LeaveHandler | undefined;

  const remember = (key: PageKey) => {
    const keys = known.get(key.workspaceId) ?? new Set<string>();
    keys.add(keyOf(key));
    known.set(key.workspaceId, keys);
  };
  const clearTimer = (id: string) => {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
  };
  const leave = (id: string) => {
    clearTimer(id);
    if (!onLeave) return Promise.resolve();
    return onLeave(parse(id)).catch(error => console.warn(`Could not leave the page ${id.replaceAll("\0", "/")}: ${error instanceof Error ? error.message : String(error)}`));
  };
  const arm = (id: string) => {
    clearTimer(id);
    const timer = setTimeout(() => { timers.delete(id); void leave(id); }, leaveAfterMs);
    timer.unref?.();
    timers.set(id, timer);
  };

  const hub = {
    /** The AgentRuntime's leave rule */
    onLeave(handler: LeaveHandler | undefined) { onLeave = handler; },
    /** A page socket opened: its key's timer stops, and every other page key of the workspace is left now */
    async join(key: PageKey, peer: PresencePeer): Promise<void> {
      const id = keyOf(key);
      remember(key);
      clearTimer(id);
      const set = peers.get(id) ?? new Map<string, PresencePeer>();
      set.set(peer.id, peer);
      peers.set(id, set);
      const others = [...known.get(key.workspaceId) ?? []].filter(other => other !== id);
      await Promise.all(others.map(other => leave(other)));
    },
    /** A page socket closed: the last one starts the key's 30-second timer */
    part(key: PageKey, peer: Pick<PresencePeer, "id">): void {
      const id = keyOf(key);
      const set = peers.get(id);
      set?.delete(peer.id);
      if (set?.size) return;
      peers.delete(id);
      arm(id);
    },
    /** After a host restart: a page with something to leave and no socket is left 30 seconds after the host is ready */
    armIfAbsent(key: PageKey): void {
      const id = keyOf(key);
      remember(key);
      if (!peers.get(id)?.size && !timers.has(id)) arm(id);
    },
    /** A host that stops takes its sessions' pending leaves with it (design, "Startup and recovery order") */
    clearTimers(keys: PageKey[]): void {
      for (const key of keys) clearTimer(keyOf(key));
    },
    open(key: PageKey): boolean { return Boolean(peers.get(keyOf(key))?.size); },
    pending(key: PageKey): boolean { return timers.has(keyOf(key)); },
    /** Page sockets of a workspace, for idle stop */
    sockets(workspaceId: string): number {
      let count = 0;
      for (const [id, set] of peers) if (id.startsWith(`${workspaceId}\0`)) count += set.size;
      return count;
    },
    /** Sends a notification to every socket of the page key; answers whether any was open */
    send(key: PageKey, method: string, params: unknown): boolean {
      const set = peers.get(keyOf(key));
      if (!set?.size) return false;
      const data = JSON.stringify(notification(method, params));
      for (const peer of set.values()) peer.send(data);
      return true;
    },
  };
  return hub;
}
export type PresenceHub = ReturnType<typeof createPresenceHub>;

const hubKey = Symbol.for("dojofoo.presence");
type Holder = { hub?: PresenceHub };
// Process-global: every Nitro chunk that loads this module shares one hub (as the host-port registry)
const holder = ((globalThis as Record<symbol, unknown>)[hubKey] ??= {}) as Holder;

/** The process's hub; page notifications reach its sockets from the first call on */
export function presence(): PresenceHub {
  if (!holder.hub) {
    const hub = createPresenceHub();
    holder.hub = hub;
    setPageSink((key, message) => hub.send(key, message.method, message.params));
  }
  return holder.hub;
}
