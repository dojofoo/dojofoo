import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface HostPortFixtureCall { method: string; workspaceId: string; persona: string; sessionId: string; idempotencyKey: string; input: unknown; bearer?: string }
export type HostPortFixtureHandler = (input: any, call: HostPortFixtureCall) => unknown;

/** For tests only: a host port that accepts any bearer, records every call and answers from `handlers` (`{ ok: true }` otherwise).
 *  `onAnswered` runs once a call's answer has been written (as the UI server's answered-first host-port work does). */
export async function startHostPortFixture(options: { handlers?: Record<string, HostPortFixtureHandler>; onAnswered?: (call: HostPortFixtureCall) => void } = {}) {
  const calls: HostPortFixtureCall[] = [];
  const handlers = options.handlers ?? {};
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", async () => {
      let answered: HostPortFixtureCall | undefined;
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(body), () => { if (answered) options.onAnswered?.(answered); });
      };
      const match = /\/host-port\/([^/]+)\/([^/]+)\/([^/]+)\/?$/u.exec(new URL(request.url ?? "/", "http://fixture").pathname);
      if (!match) return send(404, { error: "host_port_method_unknown", message: "No such host-port method." });
      let body: { sessionId?: string; idempotencyKey?: string; input?: unknown } = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {}
      const [workspaceId, persona, method] = match.slice(1).map(decodeURIComponent) as [string, string, string];
      const call: HostPortFixtureCall = { method, workspaceId, persona, sessionId: body.sessionId ?? "", idempotencyKey: body.idempotencyKey ?? "", input: body.input,
        bearer: /^Bearer (.+)$/u.exec(request.headers.authorization ?? "")?.[1] };
      calls.push(call);
      answered = call;
      try {
        const handler = Object.hasOwn(handlers, method) ? handlers[method] : undefined;
        send(200, { result: handler ? await handler(body.input, call) : { ok: true } });
      } catch (error) {
        const typed = error as { status?: unknown; code?: unknown; message?: unknown };
        send(typeof typed.status === "number" ? typed.status : 500, { error: typeof typed.code === "string" ? typed.code : "host_port_failed", message: String(typed.message ?? error) });
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/api/host-port`,
    calls,
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
