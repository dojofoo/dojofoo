# Local API hardening

*   **Author:** tomsiwik
*   **Status:** Brief
*   **Date:** 2026-11-03

Follows from `docs/designs/agent-runtime.md`, "Future Improvements". That design checks the Origin and a per-launch token only on the routes it adds: `POST /sessions/default` and `POST /agents/{id}/select`. It also checks the Origin on the lesson socket. This brief covers the rest of the server.

## Problem

The UI server listens on the user's machine. Its API reads and writes course files, starts coding agents and runs commands. Its only browser protection today is CORS: it reflects only its own origin (`packages/ui/src/server/app.ts:56-76`). CORS stops a foreign page from reading responses, but it doesn't stop that page from sending them:

*   A foreign page can still send simple cross-site POSTs, since the server doesn't check `Origin` or `Sec-Fetch-Site` before acting.
*   Nothing checks the `Host` header, so a DNS-rebinding page that resolves its own name to 127.0.0.1 counts as same-origin.
*   The lesson socket rejects a foreign `Origin` (`packages/ui/server/routes/api/session.ts:9-10`). It still accepts a missing one and doesn't check `Host`.

The routes include `/api/v1` (sessions and agents), `/api/control`, `/api/workspaces`, `/api/run-command`, `/api/interactive`, `/api/authoring`, `/api/teaching` and `/api/local` (`app.ts:78-92`), plus the persona host port.

## Goals

*   Check `Host` against the server's own addresses on every route and on the WebSocket upgrade.
*   On every state-changing route, require a same-origin `Origin` or `Sec-Fetch-Site`, plus the per-launch token.
*   Give the per-launch token to the page the server serves, and to nothing else.
*   Make a rejected request return one plain error that the UI can show.

## Open questions

*   Which hosts are the server's own? Possible ones are `localhost`, `127.0.0.1`, `[::1]`, the portless name (`dojo.localhost`, `*.dojo.td`), and any custom `HOST`.
*   Is the token needed at all, given the `Host` and `Origin` checks?
*   Which callers outside the browser use these routes today, and how do they get the token? Candidates are the CLI, the A2A endpoints, and coding agents calling back through MCP or the host port.
*   Should GET routes that read journals and course files also require the token?

## Next step

List every caller of each route group, then write the design. It's a prerequisite before the server is reachable from anything other than the local browser.
