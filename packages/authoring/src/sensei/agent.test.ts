import { afterEach, expect, it } from "vitest";
import { createHostPortClient } from "@dojofoo/agent/host-port";
import { startHostPortFixture } from "@dojofoo/agent/host-port/fixture";
import { sessionForModelCall } from "./agent.ts";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of closers.splice(0)) await close(); });

it("the turn check runs on every model call, outside the turn's memo", async () => {
  const interrupted = new Set<string>();
  const port = await startHostPortFixture({ handlers: {
    "turn.check": (input: { turnId?: string }) => {
      if (input.turnId && interrupted.has(input.turnId)) throw Object.assign(new Error("This turn was interrupted by an agent switch."), { status: 409, code: "turn_interrupted" });
      return { ok: true };
    },
    session: () => ({ courseId: "first", mode: "katas", revision: 0 }),
  } });
  closers.push(port.close);
  const client = createHostPortClient({ url: port.url, workspaceId: "w1", persona: "sensei", secret: "s" });
  // Eve's memo returns the saved value on a later call (and after a cold start); the check must not be inside it
  const saved = new Map<string, unknown>();
  const ctx = { session: { id: "eve-1" }, turn: { id: "turn-1" }, memo: async (key: unknown, run: () => Promise<unknown>) => {
    const id = JSON.stringify(key);
    if (!saved.has(id)) saved.set(id, await run());
    return saved.get(id);
  } } as unknown as Parameters<typeof sessionForModelCall>[1];
  await sessionForModelCall(client, ctx);
  await sessionForModelCall(client, ctx);
  expect(port.calls.map(call => call.method)).toEqual(["turn.check", "session", "turn.check"]);
  expect(port.calls[0]?.input).toEqual({ turnId: "turn-1" });
  interrupted.add("turn-1");
  await expect(sessionForModelCall(client, ctx)).rejects.toThrow(new Error("This turn was interrupted by an agent switch."));
  const error = await sessionForModelCall(client, ctx).catch(failure => failure);
  expect(error).not.toHaveProperty("statusCode");
  expect(error).not.toHaveProperty("status");
});
