import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createHostPortClient, createHostPortServer, HostPortError, HostPortFailure } from "../src/host-port/index.ts";

const secret = "a".repeat(64);
function server(counts: Record<string, number> = {}) {
  return createHostPortServer({
    secret: (workspaceId, persona) => workspaceId === "w1" && persona === "sensei" ? secret : undefined,
    handlers: {
      sensei: {
        session: { mutates: false, handle: ({ sessionId }) => { counts.session = (counts.session ?? 0) + 1; return { courseId: "first", sessionId }; } },
        "turn.settled": { mutates: true, handle: ({ input }) => { counts.settled = (counts.settled ?? 0) + 1; return { ok: true, count: counts.settled, input }; } },
        context: { mutates: false, handle: () => { throw new HostPortFailure(422, "invalid_request", "Kata lessons still run on their own connection."); } },
      },
    },
  });
}
const post = (handle: ReturnType<typeof server>, path: string, body: unknown, headers: Record<string, string> = { authorization: `Bearer ${secret}` }) =>
  handle(new Request(`http://127.0.0.1/api/host-port/${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

describe("host port", () => {
  it("refuses a missing or wrong secret and any request with an Origin", async () => {
    const handle = server();
    const body = { sessionId: "s1", idempotencyKey: "k1", input: {} };
    for (const headers of [{}, { authorization: `Bearer ${"b".repeat(64)}` }, { authorization: `Bearer ${secret}`, origin: "http://127.0.0.1:4567" }]) {
      const response = await post(handle, "w1/sensei/session", body, headers);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: "host_port_unauthorized" });
    }
    // No host runs for this workspace, so no secret matches
    expect((await post(handle, "w2/sensei/session", body)).status).toBe(401);
  });

  it("routes to the persona's method handler", async () => {
    const handle = server();
    const response = await post(handle, "w1/sensei/session", { sessionId: "s1", idempotencyKey: "k1", input: {} });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: { courseId: "first", sessionId: "s1" } });
    expect((await post(handle, "w1/sensei/evaluation.start", { sessionId: "s1", idempotencyKey: "k1", input: {} })).status).toBe(404);
    expect((await post(handle, "w1/sensei/toString", { sessionId: "s1", idempotencyKey: "k1", input: {} })).status).toBe(404);
    expect((await post(handle, "w1/sensei/session", { idempotencyKey: "k1" })).status).toBe(422);
    const refused = await post(handle, "w1/sensei/context", { sessionId: "s1", idempotencyKey: "k2", input: {} });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ error: "invalid_request", message: "Kata lessons still run on their own connection." });
  });

  it("a repeated mutating call returns the stored result without running again", async () => {
    const counts: Record<string, number> = {};
    const handle = server(counts);
    const body = { sessionId: "s-repeat", idempotencyKey: "s-repeat:turn-1:settled", input: { turnId: "turn-1", outcome: "completed" } };
    const first = await (await post(handle, "w1/sensei/turn.settled", body)).json();
    const second = await (await post(handle, "w1/sensei/turn.settled", body)).json();
    expect(second).toEqual(first);
    expect(counts.settled).toBe(1);
  });

  it("a reused key with different input answers 409 idempotency_key_reused", async () => {
    const handle = server();
    await post(handle, "w1/sensei/turn.settled", { sessionId: "s-reused", idempotencyKey: "k", input: { outcome: "completed" } });
    const response = await post(handle, "w1/sensei/turn.settled", { sessionId: "s-reused", idempotencyKey: "k", input: { outcome: "failed" } });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "idempotency_key_reused" });
  });

  it("reads are never stored", async () => {
    const counts: Record<string, number> = {};
    const handle = server(counts);
    const body = { sessionId: "s-read", idempotencyKey: "same", input: {} };
    await post(handle, "w1/sensei/session", body);
    await post(handle, "w1/sensei/session", { ...body, input: { other: true } });
    expect(counts.session).toBe(2);
  });

  it("the client times out after 10 s and reports the server's code", async () => {
    const handle = server();
    const listener = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      if (request.url?.includes("/slow")) return; // never answers
      const answer = await handle(new Request(`http://127.0.0.1${request.url}`, { method: "POST", headers: request.headers as Record<string, string>, body: Buffer.concat(chunks) }));
      response.writeHead(answer.status, { "content-type": "application/json" });
      response.end(await answer.text());
    });
    await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(listener.address() as AddressInfo).port}/api/host-port`;
    try {
      const client = createHostPortClient({ url, workspaceId: "w1", persona: "sensei", secret });
      expect(await client.call("session", "s1", {})).toEqual({ courseId: "first", sessionId: "s1" });
      const refused = await client.call("context", "s1", {}).catch(error => error);
      expect(refused).toBeInstanceOf(HostPortError);
      expect(refused).toMatchObject({ status: 422, code: "invalid_request" });
      const wrong = await createHostPortClient({ url, workspaceId: "w1", persona: "sensei", secret: "wrong" }).call("session", "s1", {}).catch(error => error);
      expect(wrong).toMatchObject({ status: 401, code: "host_port_unauthorized" });
      const started = Date.now();
      const slow = await createHostPortClient({ url: `${url}/slow`, workspaceId: "w1", persona: "sensei", secret, timeoutMs: 200 }).call("session", "s1", {}).catch(error => error);
      expect(slow).toMatchObject({ code: "host_port_timeout" });
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally {
      listener.closeAllConnections();
      await new Promise(resolve => listener.close(resolve));
    }
  });
});
