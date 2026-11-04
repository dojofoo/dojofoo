import { afterEach, expect, it } from "vitest";
import { createHostPortClient } from "@dojofoo/agent/host-port";
import { startHostPortFixture } from "@dojofoo/agent/host-port/fixture";
import { createSenseiAgent, sessionForModelCall } from "./agent.ts";

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

const usage = (inputTokens: number, cacheReadTokens: number, outputTokens: number) =>
  ({ inputTokens, cacheReadTokens, cacheWriteTokens: 0, outputTokens, reasoningTokens: 0 }) as never;
const sessionUsage = (agent: ReturnType<typeof createSenseiAgent>) =>
  (agent as unknown as { limits: { sessionUsage: (usage: { total: unknown; window: unknown }) => boolean } }).limits.sessionUsage;

it("a learner host never caps usage", () => {
  const limit = sessionUsage(createSenseiAgent(async () => { throw new Error("not called"); }));
  expect(limit({ total: usage(1e12, 0, 1e12), window: usage(1e12, 0, 1e12) })).toBe(false);
});

it("an evaluation-trial host stops at the ceiling's new input or output", () => {
  const limit = sessionUsage(createSenseiAgent(async () => { throw new Error("not called"); }, () => ({ newInputTokens: 1000, outputTokens: 100 })));
  const window = usage(0, 0, 0);
  // Cache reads are not new input
  expect(limit({ total: usage(5000, 4001, 99), window })).toBe(false);
  expect(limit({ total: usage(5000, 4000, 99), window })).toBe(true);
  expect(limit({ total: usage(10, 0, 100), window })).toBe(true);
});
