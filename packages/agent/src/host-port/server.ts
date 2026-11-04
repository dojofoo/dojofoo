import type { HostPortErrorCode, Persona } from "@dojofoo/protocol";
import { createHash, timingSafeEqual } from "node:crypto";

/** One host-port method. A `mutates` method's result is kept per idempotency key, so a rerun step never runs it twice. */
export interface HostPortMethod<Input = any, Result = unknown> {
  mutates: boolean;
  handle(request: { workspaceId: string; persona: Persona; sessionId: string; idempotencyKey: string; input: Input }): Promise<Result> | Result;
}
export type HostPortHandlers = Partial<Record<Persona, Readonly<Record<string, HostPortMethod>>>>;

/** A handler's typed refusal; anything else answers 500. */
export class HostPortFailure extends Error {
  readonly status: number;
  readonly code: HostPortErrorCode | string;
  constructor(status: number, code: HostPortErrorCode | string, message: string) {
    super(message);
    this.name = "HostPortFailure";
    this.status = status;
    this.code = code;
  }
}

type Stored = { hash: string; result: Promise<unknown> };
const limit = 1024;
const storeKey = Symbol.for("dojofoo.host-port.idempotency");
// Process-global: route modules may be loaded twice by the dev runner
const stores = ((globalThis as Record<symbol, unknown>)[storeKey] ??= new Map<string, Map<string, Stored>>()) as Map<string, Map<string, Stored>>;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const failure = (status: number, error: string, message: string) => json(status, { error, message });
const sameSecret = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** `POST …/host-port/{workspaceId}/{persona}/{method}` with `Authorization: Bearer <the host's per-start secret>`. */
export function createHostPortServer(options: {
  /** The secret of the running host for (workspaceId, persona), or undefined when none runs. */
  secret(workspaceId: string, persona: Persona): string | undefined;
  handlers: HostPortHandlers;
}): (request: Request) => Promise<Response> {
  return async request => {
    const match = /\/host-port\/([^/]+)\/([^/]+)\/([^/]+)\/?$/u.exec(new URL(request.url).pathname);
    if (request.method !== "POST" || !match) return failure(404, "host_port_method_unknown", "No such host-port method.");
    const [workspaceId, persona, method] = match.slice(1).map(decodeURIComponent) as [string, Persona, string];
    // Browsers never call the host port; only the persona host holds its secret
    const expected = options.secret(workspaceId, persona);
    const bearer = /^Bearer (.+)$/u.exec(request.headers.get("authorization") ?? "")?.[1];
    if (request.headers.has("origin") || !expected || !bearer || !sameSecret(bearer, expected)) {
      return failure(401, "host_port_unauthorized", "The host port needs the running host's secret.");
    }
    const handler = options.handlers[persona]?.[method];
    if (!handler || !Object.hasOwn(options.handlers[persona]!, method)) return failure(404, "host_port_method_unknown", `No host-port method ${method} for ${persona}.`);
    let body: unknown;
    try { body = await request.json(); } catch { return failure(422, "invalid_request", "The body must be JSON."); }
    const { sessionId, idempotencyKey, input } = (body ?? {}) as Record<string, unknown>;
    if (typeof sessionId !== "string" || typeof idempotencyKey !== "string" || !idempotencyKey) {
      return failure(422, "invalid_request", "A host-port call needs sessionId, idempotencyKey and input.");
    }
    const run = () => Promise.resolve().then(() => handler.handle({ workspaceId, persona, sessionId, idempotencyKey, input }));
    let result: Promise<unknown>;
    if (handler.mutates) {
      const hostKey = `${workspaceId}\0${persona}`;
      const store = stores.get(hostKey) ?? new Map<string, Stored>();
      stores.set(hostKey, store);
      const key = `${sessionId}\0${idempotencyKey}`;
      const hash = createHash("sha256").update(JSON.stringify(input ?? null)).digest("hex");
      const stored = store.get(key);
      if (stored && stored.hash !== hash) return failure(409, "idempotency_key_reused", "This idempotency key was used with a different input.");
      if (stored) result = stored.result;
      else {
        result = run();
        store.set(key, { hash, result });
        while (store.size > limit) store.delete(store.keys().next().value!);
        // A failed call keeps nothing, so the caller can retry it
        result.catch(() => { if (store.get(key)?.result === result) store.delete(key); });
      }
    } else result = run();
    try {
      return json(200, { result: await result });
    } catch (error) {
      if (error instanceof HostPortFailure || (error && typeof error === "object" && "status" in error && "code" in error
        && typeof error.status === "number" && typeof error.code === "string")) {
        const typed = error as { status: number; code: string; message?: string };
        return failure(typed.status, typed.code, typed.message ?? typed.code);
      }
      return failure(500, "host_port_failed", error instanceof Error ? error.message : String(error));
    }
  };
}
