import { expose, proxy, releaseProxy, transfer, wrap } from "comlink";
import type { HarnessV1NetworkSandboxSession } from "@ai-sdk/harness";
import { randomUUID } from "node:crypto";
import { MessageChannel, MessagePort, postMessageToThread, threadId } from "node:worker_threads";

type Files = ReturnType<HarnessV1NetworkSandboxSession["restricted"]>;
type ProcessHandle = Awaited<ReturnType<Files["spawn"]>>;
type HostConnection = { threadId: number; id: string };
const hosts = new Map<string, { session: HarnessV1NetworkSandboxSession; ports: Set<MessagePort> }>();
const connectMessage = "dojo.local-process-host.connect";

function acceptConnection(value: unknown): void {
  if (!value || typeof value !== "object" || !("type" in value) || value.type !== connectMessage) return;
  if (!("id" in value) || typeof value.id !== "string" || !("port" in value) || !(value.port instanceof MessagePort)) {
    throw new Error("Invalid local process-host connection.");
  }
  const host = hosts.get(value.id);
  if (!host) throw new Error("Local process host is no longer available.");
  const port = value.port;
  host.ports.add(port);
  port.once("close", () => host.ports.delete(port));
  exposeLocalProcessHost(host.session, port);
}

/** Register in the long-lived coordinator, not in an Eve worker. */
export function registerLocalProcessHost(session: HarnessV1NetworkSandboxSession) {
  if (hosts.size === 0) process.on("workerMessage", acceptConnection);
  const id = randomUUID();
  const entry = { session, ports: new Set<MessagePort>() };
  hosts.set(id, entry);
  let closing: Promise<void> | undefined;
  return {
    connection: { threadId, id } satisfies HostConnection,
    close() {
      return closing ??= Promise.resolve().then(async () => {
        hosts.delete(id);
        if (hosts.size === 0) process.off("workerMessage", acceptConnection);
        try { await session.stop(); }
        finally { for (const port of entry.ports) port.close(); entry.ports.clear(); }
      });
    },
  };
}

/** Node transports the private port; Comlink owns all process RPC messages. */
export async function requestLocalProcessHost(connection: HostConnection) {
  const { port1, port2 } = new MessageChannel();
  try {
    // Start listening before awaiting thread delivery; a bare MessagePort does
    // not keep a short-lived worker alive during that asynchronous handshake.
    const host = connectLocalProcessHost(port1);
    const message = { type: connectMessage, id: connection.id, port: port2 };
    if (connection.threadId === threadId) acceptConnection(message);
    else await postMessageToThread(connection.threadId, message, [port2], 5000);
    return host;
  } catch (error) {
    port1.close();
    port2.close();
    throw error;
  }
}

function createProcessHost(session: Pick<Files, "spawn">) {
  return {
    async spawn(options: Parameters<Files["spawn"]>[0]) {
      const child = await session.spawn(options);
      return proxy({
        pid: child.pid,
        stdout: () => transfer(child.stdout, [child.stdout]),
        stderr: () => transfer(child.stderr, [child.stderr]),
        wait: async () => await child.wait(),
        kill: async () => await child.kill(),
      });
    },
  };
}

/** Pass a private MessagePort to trusted Eve workers. The parent retains the
 * actual sandbox/process handles; closing a worker is not closing the runtime.
 * The caller must close ports and stop the parent sandbox on final shutdown.
 */
export function exposeLocalProcessHost(session: Pick<Files, "spawn">, port: MessagePort): void {
  expose(createProcessHost(session), port);
}

export function connectLocalProcessHost(port: MessagePort): Pick<Files, "spawn"> {
  const host = wrap<ReturnType<typeof createProcessHost>>(port);
  return {
    async spawn(options): Promise<ProcessHandle> {
      // AbortSignal is not transferable. Cancellation remains the caller's
      // responsibility through the returned official process handle.
      options.abortSignal?.throwIfAborted();
      const { abortSignal, ...input } = options;
      const child = await host.spawn(input);
      const [pid, stdout, stderr] = await Promise.all([child.pid, child.stdout(), child.stderr()]);
      let finished = false;
      const completion = child.wait().then(result => {
        abortSignal?.throwIfAborted();
        return result;
      }).finally(() => {
        finished = true;
        abortSignal?.removeEventListener("abort", abort);
        child[releaseProxy]();
      });
      void completion.catch(() => {});
      const kill = async () => { if (!finished) await child.kill(); };
      const abort = () => { void kill().catch(() => {}); };
      abortSignal?.addEventListener("abort", abort, { once: true });
      if (abortSignal?.aborted) await kill();
      return { pid, stdout, stderr, wait: () => completion, kill };
    },
  };
}
