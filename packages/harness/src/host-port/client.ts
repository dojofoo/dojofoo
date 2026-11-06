import type { HostPortErrorCode, Persona } from "@dojofoo/protocol";
import { randomUUID } from "node:crypto";

export class HostPortError extends Error {
  readonly status: number;
  readonly code: HostPortErrorCode | string;
  constructor(status: number, code: HostPortErrorCode | string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "HostPortError";
    this.status = status;
    this.code = code;
  }
}

export interface HostPortClient {
  /** A read gets a random key; a mutating call passes a stable one (`<eveSessionId>:<callId>` for a tool call). */
  call<Result = unknown>(method: string, sessionId: string, input: unknown, idempotencyKey?: string): Promise<Result>;
}

/** The persona host's side of the host port: every call carries the per-start secret as its bearer. */
export function createHostPortClient(options: { url: string; workspaceId: string; persona: Persona; secret: string; timeoutMs?: number }): HostPortClient {
  const base = options.url.replace(/\/+$/u, "");
  return {
    async call<Result>(method: string, sessionId: string, input: unknown, idempotencyKey = randomUUID()): Promise<Result> {
      const url = `${base}/${encodeURIComponent(options.workspaceId)}/${encodeURIComponent(options.persona)}/${encodeURIComponent(method)}`;
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${options.secret}`, "content-type": "application/json" },
          body: JSON.stringify({ sessionId, idempotencyKey, input: input ?? {} }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        });
      } catch (error) {
        const timedOut = error instanceof Error && error.name === "TimeoutError";
        throw new HostPortError(timedOut ? 504 : 502, timedOut ? "host_port_timeout" : "host_port_failed",
          timedOut ? `The host port did not answer ${method} in time.` : `The host port is unreachable: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
      const body = await response.json().catch(() => undefined) as { result?: Result; error?: string; message?: string } | undefined;
      if (!response.ok) throw new HostPortError(response.status, body?.error ?? "host_port_failed", body?.message ?? `The host port answered ${response.status}.`);
      return body?.result as Result;
    },
  };
}
