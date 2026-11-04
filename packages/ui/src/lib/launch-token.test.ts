import { afterEach, beforeEach, expect, it, vi } from "vitest";

type Reply = { status: number; body: unknown };
let replies: Record<string, Reply[]>;
let requests: Array<{ url: string; token: string | null }>;

beforeEach(() => {
  vi.resetModules();
  requests = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    requests.push({ url: input, token: new Headers(init?.headers).get("x-dojofoo-launch-token") });
    const queue = replies[input]!;
    const { status, body } = queue.length > 1 ? queue.shift()! : queue[0]!;
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

const tokens = (...values: string[]) => values.map(token => ({ status: 200, body: { token } }));
const refused = { status: 403, body: { error: "launch_token_invalid", message: "This page's launch token is out of date." } };
const select = "/api/v1/workspaces/ws-1/agents/opencode/select";

it("retries once with a fresh token after 403 launch_token_invalid", async () => {
  replies = { "/api/control/launch-token": tokens("stale", "fresh"), [select]: [refused, { status: 200, body: { id: "opencode" } }] };
  const { launchFetch } = await import("./launch-token");
  const response = await launchFetch(select, { method: "POST" });
  expect(response.status).toBe(200);
  expect(requests).toEqual([
    { url: "/api/control/launch-token", token: null }, { url: select, token: "stale" },
    { url: "/api/control/launch-token", token: null }, { url: select, token: "fresh" },
  ]);
  // The fresh token stays cached for the next request
  await launchFetch(select, { method: "POST" });
  expect(requests.at(-1)).toEqual({ url: select, token: "fresh" });
  expect(requests.filter(request => request.url === "/api/control/launch-token")).toHaveLength(2);
});

it("throws LaunchTokenError after a second refusal", async () => {
  replies = { "/api/control/launch-token": tokens("stale"), [select]: [refused] };
  const { launchFetch, LaunchTokenError } = await import("./launch-token");
  await expect(launchFetch(select, { method: "POST" })).rejects.toBeInstanceOf(LaunchTokenError);
  expect(requests.filter(request => request.url === select)).toHaveLength(2);
});

it("does not retry other 403s", async () => {
  replies = { "/api/control/launch-token": tokens("current"), [select]: [{ status: 403, body: { error: "origin_forbidden", message: "Same-origin requests only." } }] };
  const { launchFetch } = await import("./launch-token");
  expect((await launchFetch(select, { method: "POST" })).status).toBe(403);
  expect(requests).toHaveLength(2);
});
