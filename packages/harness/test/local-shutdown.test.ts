import { describe, expect, it } from "vitest";
// The assembled runtime (patches/eve-local-shutdown@1.0.0-rc.1.patch), as the Kyoshi and Sensei servers run it
import { installSandboxShutdownHandlers } from "../dist/eve/dist/src/internal/nitro/host/sandbox-shutdown-plugin.js";
import { trackLocalWorkflowDelivery } from "../dist/eve/dist/src/internal/workflow/local-world-delivery-auth.js";
// The development server's own close (createDevelopmentServer().close() drains it before disposing the world)
import { DrainedNitroDevServer } from "../dist/eve/dist/src/internal/nitro/host/drained-nitro-dev-server.js";
import { DEVELOPMENT_WORKFLOW_DELIVERY_HEADER } from "../dist/eve/dist/src/internal/workflow/development-world-protocol.js";

/** A process that records its exit and lets the test send it a signal */
function fakeProcess() {
  const listeners = new Map<string, () => void>();
  const exits: number[] = [];
  return {
    exits,
    signal: (name: string) => listeners.get(name)?.(),
    process: { env: {}, exit: (code?: number) => { exits.push(code ?? 0); }, once: (event: string, listener: () => void) => { listeners.set(event, listener); } },
  };
}

describe("local server shutdown", () => {
  it("exits on SIGTERM only after an in-flight workflow delivery has finished", async () => {
    const host = fakeProcess();
    installSandboxShutdownHandlers({ log: () => {}, process: host.process });
    let finish = () => {};
    // A step that has published its events but not yet recorded its result (the parked question of
    // kyoshi.host.ask-answer-across-restart): cut short, it stays leased to the dead invocation after a restart
    const delivery = trackLocalWorkflowDelivery(() => new Promise<void>(resolve => { finish = resolve; }));
    host.signal("SIGTERM");
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(host.exits).toEqual([]);
    finish();
    await delivery;
    await expect.poll(() => host.exits).toEqual([143]);
  });

  it("exits on SIGTERM at once when no delivery is in flight", async () => {
    const host = fakeProcess();
    installSandboxShutdownHandlers({ log: () => {}, process: host.process });
    host.signal("SIGTERM");
    await expect.poll(() => host.exits, { timeout: 1000 }).toEqual([143]);
  });
});

/** A development server whose worker answers every request only when the test says so */
async function heldDevelopmentServer() {
  const held: Array<() => void> = [];
  const server = new DrainedNitroDevServer({ error: () => {} }, () => ({
    closed: false,
    close: async () => {},
    fetch: () => new Promise<Response>(resolve => { held.push(() => resolve(new Response("ok"))); }),
    onceClosed: () => {},
    upgrade: async () => {},
    waitForReady: async () => {},
  }));
  await server.replaceWorker({ entry: "worker.mjs", workerData: {} });
  const listener = server.listen({ hostname: "127.0.0.1", port: 0 });
  await listener.ready();
  const post = (delivery: boolean) => fetch(new URL("/.well-known/workflow/v1/flow", listener.url), {
    method: "POST", body: "{}", headers: delivery ? { [DEVELOPMENT_WORKFLOW_DELIVERY_HEADER]: "secret" } : {},
  });
  const answer = () => held.splice(0).forEach(resolve => resolve());
  return { server, post, answer, held, close: async () => { answer(); await server.close(); } };
}

describe("development server close", () => {
  it("waits for an in-flight workflow delivery and refuses new ones", async () => {
    const host = await heldDevelopmentServer();
    try {
      // The turn step of the host test's last native turn: it has streamed turn.settled, so the test
      // closes the server, but has not recorded its own completion yet (Linux CI run 41852746034)
      const inFlight = host.post(true);
      await expect.poll(() => host.held.length).toBe(1);
      let drained: boolean | undefined;
      const drain = host.server.drainWorkflowDeliveries().then(result => { drained = result; });
      expect((await host.post(true)).status).toBe(503);
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(drained).toBeUndefined();
      host.answer();
      expect((await inFlight).status).toBe(200);
      await drain;
      expect(drained).toBe(true);
    } finally {
      await host.close();
    }
  });

  it("is not held by a client request such as an open event stream", async () => {
    const host = await heldDevelopmentServer();
    try {
      const stream = host.post(false);
      await expect.poll(() => host.held.length).toBe(1);
      expect(await host.server.drainWorkflowDeliveries()).toBe(true);
      host.answer();
      expect((await stream).status).toBe(200);
    } finally {
      await host.close();
    }
  });

  it("stops waiting for a delivery after 1 s", async () => {
    const host = await heldDevelopmentServer();
    try {
      const inFlight = host.post(true);
      await expect.poll(() => host.held.length).toBe(1);
      const started = Date.now();
      expect(await host.server.drainWorkflowDeliveries()).toBe(false);
      expect(Date.now() - started).toBeGreaterThanOrEqual(900);
      host.answer();
      await inFlight;
    } finally {
      await host.close();
    }
  });
});
