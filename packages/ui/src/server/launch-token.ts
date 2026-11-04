import { randomBytes } from "node:crypto";
import { launchGuard } from "@dojofoo/harness/api";
import { requestOrigin } from "./request-origin";

const key = Symbol.for("dojofoo.launchToken");

/** One random token per UI-server process, shared by route modules the dev runner duplicates. It is never
 * written to disk or into HTML, so a restarted server refuses the pages of the earlier launch. */
export function launchToken(): string {
  const store = globalThis as typeof globalThis & Record<symbol, string | undefined>;
  return store[key] ??= randomBytes(32).toString("base64url");
}

/** Same-origin requests carrying this launch's token only. */
export const authorizeLaunchRequest = launchGuard({ token: launchToken, origin: requestOrigin });
