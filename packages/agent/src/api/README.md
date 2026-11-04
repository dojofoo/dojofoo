# @dojofoo/agent/api

The versioned workspace agent API, as an Elysia app: coding agents and sessions
under `/api/v1`, in the public Course API's conventions (`{ error, message }` errors,
`{ data, pagination }` collections with zero-based `page` and `per_page`).

```ts
import { createAgentApi } from "@dojofoo/agent/api";

const api = createAgentApi(runtime); // an AgentRuntime: where agents run
hono.mount("/api/v1", request => api.handle(request), { replaceRequest: false });
```

`dojofoo ui` mounts it with a runtime that starts local Eve processes
(`packages/ui/src/server/agent-api.ts`); a hosted server can implement the same
`AgentRuntime` with cloud sandboxes.

| Operation | Call |
| --- | --- |
| `listAgents` | `GET /workspaces/{workspaceId}/agents` |
| `getAgent` | `GET /workspaces/{workspaceId}/agents/{agentId}` |
| `startAgent` | `POST /workspaces/{workspaceId}/agents/{agentId}` → `202` |
| `stopAgent` | `DELETE /workspaces/{workspaceId}/agents/{agentId}` → `202` |
| `listSessions` | `GET /workspaces/{workspaceId}/sessions?agent&persona&page&per_page` |
| `openDefaultSession` | `POST /workspaces/{workspaceId}/sessions/default` `{ course?, lesson?, session?, new?, from? }` (the page's launch token) |
| `getSession` | `GET /workspaces/{workspaceId}/sessions/{sessionId}` |
| `eve` | `/workspaces/{workspaceId}/sessions/{sessionId}/eve/v1/session/{sessionId}/…` (the session's own Eve routes) |

`agent` is always the coding agent (`codex`, `opencode`, …); `persona` is who it speaks
as (`sensei`, `kyoshi`). A session's id is its Eve session's, and the conversation is
Eve's own: Eve's client talks to it under the session's URL, which forwards only that
session's routes (its stream, messages, answers, cancel) to the host with the host's
credentials. Errors there come in Eve's shape (`{ error: message, code }`), so its client
shows them.

```ts
import { useEveAgent } from "@dojofoo/agent/react";

const agent = useEveAgent({
  baseUrl: `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}`,
  initialSession: { sessionId, streamIndex: 0 },
  resume: true,
});
```
