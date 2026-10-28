# @dojofoo/agent-api

The versioned workspace agent API, as an Elysia app: coding agents, sessions and runs
under `/api/v1`, in the public Course API's conventions (`{ error, message }` errors,
`{ data, pagination }` collections with zero-based `page` and `per_page`).

```ts
import { createAgentApi } from "@dojofoo/agent-api";

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
| `createSession` | `POST /workspaces/{workspaceId}/sessions` `{ persona, agent?, message? }` → `201` |
| `getSession` | `GET /workspaces/{workspaceId}/sessions/{sessionId}` |
| `listMessages` | `GET /workspaces/{workspaceId}/sessions/{sessionId}/messages` |
| `createRun` | `POST /workspaces/{workspaceId}/sessions/{sessionId}/runs` (AG-UI `RunAgentInput` → SSE) |
| `listEvents` | `GET /workspaces/{workspaceId}/sessions/{sessionId}/events` (SSE, rejoins the current run) |
| `updateRun` | `PATCH /workspaces/{workspaceId}/sessions/{sessionId}/runs/{runId}` `{ status: "cancelled" }` → `202` |

`agent` is always the coding agent (`codex`, `opencode`, …); `persona` is who it speaks
as (`sensei`, `kyoshi`). The two run streams follow AG-UI because TanStack AI's
`useChat` speaks it: text, reasoning and tool calls stream as deltas. A
`MESSAGES_SNAPSHOT` restores Eve's projection once when attaching or reloading.
