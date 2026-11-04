import { describe, expect, it } from "vitest";
// The assembled runtime (patches/eve-local-shutdown@1.0.0-rc.1.patch), as the Kyoshi and Sensei servers run it
import { installSandboxShutdownHandlers } from "../dist/eve/dist/src/internal/nitro/host/sandbox-shutdown-plugin.js";
import { trackLocalWorkflowDelivery } from "../dist/eve/dist/src/internal/workflow/local-world-delivery-auth.js";

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
