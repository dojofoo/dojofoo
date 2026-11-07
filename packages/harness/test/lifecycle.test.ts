import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { trackHarnessSession } from "../src/harness-sessions.ts";
import { startHostPortFixture } from "../src/host-port/fixture.ts";
import { lifecycleHandlers, type HostPortBinding } from "../src/lifecycle.ts";
import { readOnlyEnvironment } from "../src/read-only.ts";

const closers: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of closers.splice(0)) await close(); vi.restoreAllMocks(); });
const ctx = (id: string) => ({ session: { id } });

async function fixture() {
  const port = await startHostPortFixture();
  closers.push(port.close);
  const binding: HostPortBinding = { url: port.url, workspaceId: "w1", persona: "sensei", secret: "secret-1" };
  return { port, binding };
}

describe("lifecycle hook", () => {
  it("reports a pause and a settle with stable keys", async () => {
    const { port, binding } = await fixture();
    const handlers = lifecycleHandlers(async () => binding);
    await handlers["turn.paused"]({ data: { turnId: "turn-1", awaiting: [{ interactionId: "q1" }, { interactionId: "q2" }] } }, ctx("eve-1"));
    await handlers["turn.settled"]({ data: { turnId: "turn-1", outcome: "completed" } }, ctx("eve-1"));
    await handlers["session.ended"]({ data: { outcome: "completed" } }, ctx("eve-1"));
    expect(port.calls.map(({ method, sessionId, idempotencyKey, input, bearer }) => ({ method, sessionId, idempotencyKey, input, bearer }))).toEqual([
      { method: "turn.paused", sessionId: "eve-1", idempotencyKey: "eve-1:turn-1:paused:q1,q2", input: { turnId: "turn-1", awaiting: ["q1", "q2"] }, bearer: "secret-1" },
      { method: "turn.settled", sessionId: "eve-1", idempotencyKey: "eve-1:turn-1:settled", input: { turnId: "turn-1", outcome: "completed" }, bearer: "secret-1" },
      { method: "session.ended", sessionId: "eve-1", idempotencyKey: "eve-1:ended", input: { outcome: "completed" }, bearer: "secret-1" },
    ]);
    expect(port.calls.every(call => call.workspaceId === "w1" && call.persona === "sensei")).toBe(true);
  });

  it("evicts before reporting a cancelled or failed settle and an ended session", async () => {
    const { port, binding } = await fixture();
    const order: string[] = [];
    const evict = (id: string) => trackHarnessSession(id, { sandboxId: `sandbox-${id}`, evict: async () => { order.push(`evict ${id} at ${port.calls.length}`); } });
    const handlers = lifecycleHandlers(async () => binding);
    evict("eve-cancelled");
    await handlers["turn.settled"]({ data: { turnId: "t1", outcome: "cancelled" } }, ctx("eve-cancelled"));
    evict("eve-failed");
    await handlers["turn.settled"]({ data: { turnId: "t2", outcome: "failed", error: { code: "native_exit", message: "The CLI exited." } } }, ctx("eve-failed"));
    evict("eve-ended");
    await handlers["session.ended"]({ data: { outcome: "completed" } }, ctx("eve-ended"));
    evict("eve-completed");
    await handlers["turn.settled"]({ data: { turnId: "t3", outcome: "completed" } }, ctx("eve-completed"));
    expect(order).toEqual(["evict eve-cancelled at 0", "evict eve-failed at 1", "evict eve-ended at 2"]);
    expect(port.calls[1]?.input).toEqual({ turnId: "t2", outcome: "failed", error: { code: "native_exit", message: "The CLI exited." } });
    // Without a binding the hook only evicts
    evict("eve-unbound");
    await lifecycleHandlers(async () => undefined)["turn.settled"]({ data: { turnId: "t4", outcome: "cancelled" } }, ctx("eve-unbound"));
    expect(order.at(-1)).toBe("evict eve-unbound at 4");
    expect(port.calls).toHaveLength(4);
  });

  it("a host-port failure is logged, never thrown", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handlers = lifecycleHandlers(async () => ({ url: "http://127.0.0.1:9/api/host-port", workspaceId: "w1", persona: "sensei", secret: "s" }), { retryDelaysMs: [0, 0, 0] });
    await expect(handlers["turn.settled"]({ data: { turnId: "t1", outcome: "completed" } }, ctx("eve-1"))).resolves.toBeUndefined();
    await expect(lifecycleHandlers(async () => { throw new Error("runtime.json is unreadable"); })["session.ended"]({ data: {} }, ctx("eve-2"))).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it("a report the host port did not take is retried with its key; a refusal is not", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let busy = 2;
    const port = await startHostPortFixture({ handlers: {
      "turn.settled": () => { if (busy-- > 0) throw { status: 503, code: "host_port_failed", message: "Busy." }; return { ok: true }; },
      "turn.paused": () => { throw { status: 401, code: "host_port_unauthorized", message: "The host port needs the running host's secret." }; },
    } });
    closers.push(port.close);
    const handlers = lifecycleHandlers(async () => ({ url: port.url, workspaceId: "w1", persona: "sensei", secret: "s" }), { retryDelaysMs: [0, 0, 0] });
    await handlers["turn.settled"]({ data: { turnId: "t1", outcome: "completed" } }, ctx("eve-1"));
    await handlers["turn.paused"]({ data: { turnId: "t2", awaiting: [] } }, ctx("eve-1"));
    expect(port.calls.map(call => `${call.method} ${call.idempotencyKey}`)).toEqual([
      "turn.settled eve-1:t1:settled", "turn.settled eve-1:t1:settled", "turn.settled eve-1:t1:settled", "turn.paused eve-1:t2:paused:",
    ]);
  });

  it("an ended Grok session's private home is removed", async () => {
    const { binding } = await fixture();
    const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-lifecycle-")));
    closers.push(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, "user"));
    const stateDirectory = join(root, "state");
    const { HOME: ended } = await readOnlyEnvironment("grok", { HOME: join(root, "user") }, { stateDirectory, eveSessionId: "eve-ended" });
    const { HOME: other } = await readOnlyEnvironment("grok", { HOME: join(root, "user") }, { stateDirectory, eveSessionId: "eve-other" });
    await lifecycleHandlers(async () => ({ ...binding, readOnly: { agent: "grok", stateDirectory } }))["session.ended"]({ data: { outcome: "completed" } }, ctx("eve-ended"));
    expect(existsSync(ended!)).toBe(false);
    expect(existsSync(other!)).toBe(true);
  });

  it("reports delivery.consumed only for check reports", async () => {
    const { port, binding } = await fixture();
    const handlers = lifecycleHandlers(async () => binding);
    await handlers["delivery.consumed"]({ data: { deliveryId: "d-plain", turnId: "t1", parts: [{ kind: "text", text: "Hello Sensei" }] } }, ctx("eve-1"));
    await handlers["delivery.consumed"]({ data: { deliveryId: "d-begin", turnId: "t1", parts: [{ kind: "text", text: "[dojo:begin] Begin the lesson." }] } }, ctx("eve-1"));
    await handlers["delivery.consumed"]({ data: { deliveryId: "d-check", turnId: "t2", parts: [{ kind: "text", text: "[dojo:check] Ran lesson checks." }] } }, ctx("eve-1"));
    expect(port.calls.map(({ method, idempotencyKey, input }) => ({ method, idempotencyKey, input }))).toEqual([
      { method: "delivery.consumed", idempotencyKey: "eve-1:d-check:consumed", input: { deliveryId: "d-check" } },
    ]);
  });
});
