/** `LAUNCH_TOKEN_HEADER` in @dojofoo/agent/api; that entry is server-side. */
const header = "x-dojofoo-launch-token";

/** The page's token is from an earlier UI-server launch, even after fetching it again. */
export class LaunchTokenError extends Error {
  constructor() {
    super("This page is out of date.");
    this.name = "LaunchTokenError";
  }
}

let cached: Promise<string> | undefined;

/** Module memory only: never storage, so a reload always asks the running server. */
function token(refresh = false): Promise<string> {
  if (!cached || refresh) {
    cached = fetch("/api/control/launch-token", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error(`The launch token is unavailable (${response.status}).`);
      return (await response.json() as { token: string }).token;
    });
    cached.catch(() => { cached = undefined; });
  }
  return cached;
}

async function refusedToken(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  try { return (await response.clone().json() as { error?: unknown }).error === "launch_token_invalid"; }
  catch { return false; }
}

/** `fetch` for a token-checked route. A refused token is fetched again once and the request retried once. */
export async function launchFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const send = async (refresh: boolean) => {
    const headers = new Headers(init.headers);
    headers.set(header, await token(refresh));
    return fetch(url, { ...init, headers });
  };
  const first = await send(false);
  if (!await refusedToken(first)) return first;
  const second = await send(true);
  if (await refusedToken(second)) throw new LaunchTokenError();
  return second;
}
