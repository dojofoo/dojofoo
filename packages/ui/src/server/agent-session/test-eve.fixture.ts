import { createServer, type IncomingMessage } from "node:http";
import { once } from "node:events";

/** A fake Eve host for leave and switch tests: every session's stream holds one open turn (`turn_0`), cancels and messages are
 *  recorded (and answered 202), and `onCancel` sees each cancel before it is answered. */
export async function fakeEve(options: { onCancel?(sessionId: string, body: unknown): void | Promise<void> } = {}) {
  const cancels: Array<{ sessionId: string; body: { turnId?: string } }> = [];
  const messages: Array<{ sessionId: string; body: { message?: string; idempotencyKey?: string } }> = [];
  const text = async (request: IncomingMessage) => { let body = ""; for await (const chunk of request) body += chunk; return body; };
  const server = createServer(async (request, response) => {
    const match = /^\/eve\/v1\/session\/([^/]+)(?:\/(cancel|stream))?/u.exec(new URL(request.url!, "http://eve").pathname);
    if (!match) return response.writeHead(404).end();
    const sessionId = decodeURIComponent(match[1]!);
    if (match[2] === "cancel" && request.method === "POST") {
      const raw = await text(request);
      const body = raw ? JSON.parse(raw) : {};
      await options.onCancel?.(sessionId, body);
      cancels.push({ sessionId, body });
      return response.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, sessionId, deliveryId: "delivery_cancel" }));
    }
    if (match[2] === "stream") {
      const at = new Date().toISOString();
      const lines = [
        { at, facts: [{ type: "session.started", data: { runtime: { agentId: "fake", agentName: "fake", eveVersion: "1.0.0-rc.1" } } }] },
        { at, facts: [{ type: "turn.started", data: { cause: { deliveryId: "d1" }, follows: null, turnId: "turn_0" }, scope: { turnId: "turn_0" } }] },
      ];
      return response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "x-eve-stream-version": "27", "x-eve-stream-format": "ndjson",
        "x-eve-stream-tail-index": String(lines.length - 1) }).end(lines.map(line => JSON.stringify(line)).join("\n") + "\n");
    }
    if (request.method === "POST") {
      const raw = await text(request);
      messages.push({ sessionId, body: raw ? JSON.parse(raw) : {} });
      return response.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, sessionId, deliveryId: `delivery_${messages.length}` }));
    }
    response.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, cancels, messages, close: () => new Promise<void>(accept => { server.closeAllConnections(); server.close(() => accept()); }) };
}
