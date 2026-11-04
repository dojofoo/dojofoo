import { timingSafeEqual } from "node:crypto";
import { AgentApiError } from "./runtime";

/** The header a page sends its per-launch token in; a custom header also forces a CORS preflight. */
export const LAUNCH_TOKEN_HEADER = "x-dojofoo-launch-token";

/**
 * Guards a state-changing route: the request comes from the server's own origin (a missing
 * `Origin` is allowed) and carries this server launch's token. Throws {@link AgentApiError} 403.
 */
export function launchGuard(options: { token(): string; origin(request: Request): string }): (request: Request) => void {
  return request => {
    const origin = request.headers.get("origin");
    if (origin && origin !== options.origin(request)) throw new AgentApiError(403, "origin_forbidden", "Same-origin requests only.");
    const sent = Buffer.from(request.headers.get(LAUNCH_TOKEN_HEADER) ?? "");
    const expected = Buffer.from(options.token());
    if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
      throw new AgentApiError(403, "launch_token_invalid", "This page's launch token is out of date.");
    }
  };
}
