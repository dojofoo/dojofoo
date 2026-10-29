import { t } from "elysia";
import type { Persona } from "./runtime";

// The public Course API's conventions: `{ error, message }` errors, `{ data, pagination }`
// collections with zero-based `page` and `per_page`, verb-noun operation IDs.
const count = () => t.Integer({ minimum: 0 });
export const error = t.Object({ error: t.String(), message: t.String() }, { additionalProperties: false });
const pagination = t.Object({ page: count(), perPage: t.Integer(), total: count(), hasMore: t.Boolean() });
const persona = t.Union([t.Literal("sensei" satisfies Persona), t.Literal("kyoshi" satisfies Persona)], {
  description: "The persona the coding agent speaks as: Sensei teaches, Kyoshi authors.",
});
const workspace = { workspaceId: t.String({ description: "The workspace's ID." }) };

const agent = t.Object({
  id: t.String({ examples: ["codex"] }),
  name: t.String({ examples: ["Codex"] }),
  selected: t.Boolean({ description: "The workspace's selected coding agent." }),
  status: t.Union([t.Literal("stopped"), t.Literal("starting"), t.Literal("migrating"), t.Literal("ready"), t.Literal("failed")]),
  message: t.Optional(t.String({ description: "Startup or migration progress, or why the last start failed." })),
});
const sessionSummary = {
  id: t.String(),
  agent: t.String({ description: "The coding agent's ID.", examples: ["codex"] }),
  persona,
  createdAt: t.String(),
};
const session = t.Object({
  ...sessionSummary,
  status: t.Union([t.Literal("idle"), t.Literal("running"), t.Literal("awaiting-input")]),
  position: count(),
  resume: t.Optional(t.Object({
    threadId: t.String(), runId: t.String(),
    pendingInterrupts: t.Array(t.Unknown(), { description: "TanStack AI interrupts for the questions the agent is waiting on." }),
  }, { description: "Present while a run is in progress or waiting on questions: map threadId and runId into `resumeState` alongside pendingInterrupts for `useChat({ initialResumeSnapshot })`." })),
});

const details = (operationId: string, summary: string, description: string, tag: string) => ({ operationId, summary, description, tags: [tag] });
const page = {
  page: t.Optional(t.Numeric({ minimum: 0, default: 0, description: "Zero-based page number." })),
  per_page: t.Optional(t.Numeric({ minimum: 1, maximum: 500, default: 100, description: "Items per page." })),
};
const stream = { description: "AG-UI events as Server-Sent Events (`text/event-stream`)." };

export const routes = {
  listAgents: {
    detail: details("listAgents", "List coding agents", "The coding agents a workspace can run, with their status.", "Agents"),
    params: t.Object(workspace), query: t.Object(page),
    response: { 200: t.Object({ data: t.Array(agent), pagination }), 404: error },
  },
  getAgent: {
    detail: details("getAgent", "Get a coding agent", "One coding agent's status in a workspace.", "Agents"),
    params: t.Object({ ...workspace, agentId: t.String() }),
    response: { 200: agent, 404: error },
  },
  startAgent: {
    detail: details("startAgent", "Start a coding agent", "Starts the coding agent, or keeps it running. Returns without waiting for it to be ready, so a page can warm it while it loads.", "Agents"),
    params: t.Object({ ...workspace, agentId: t.String() }),
    response: { 202: agent, 404: error, 409: error },
  },
  stopAgent: {
    detail: details("stopAgent", "Stop a coding agent", "Stops the coding agent. Its sessions keep their history.", "Agents"),
    params: t.Object({ ...workspace, agentId: t.String() }),
    response: { 202: agent, 404: error },
  },
  listSessions: {
    detail: details("listSessions", "List sessions", "A workspace's conversations, newest first, optionally for one coding agent or persona.", "Sessions"),
    params: t.Object(workspace),
    query: t.Object({ ...page, agent: t.Optional(t.String({ description: "A coding agent's ID." })), persona: t.Optional(persona) }),
    response: { 200: t.Object({ data: t.Array(t.Object(sessionSummary)), pagination }), 404: error },
  },
  createSession: {
    detail: details("createSession", "Create a session", "Starts a conversation with a persona on a coding agent (the workspace's selected one by default). Its first run starts with `message`, or the persona's greeting.", "Sessions"),
    params: t.Object(workspace),
    body: t.Object({ persona, agent: t.Optional(t.String()), message: t.Optional(t.String({ minLength: 1 })),
      forwardedProps: t.Optional(t.Record(t.String(), t.Unknown(), { description: "Client-controlled page state supplied to the runtime context hook, as in AG-UI run requests." })),
    }),
    response: { 201: session, 404: error, 409: error },
  },
  getSession: {
    detail: details("getSession", "Get a session", "A conversation's state, and what to resume while a run is in progress or waiting on questions.", "Sessions"),
    params: t.Object({ ...workspace, sessionId: t.String() }),
    response: { 200: session, 404: error },
  },
  listMessages: {
    detail: details("listMessages", "List messages", "A conversation's messages, oldest first, as TanStack AI `UIMessage`s.", "Sessions"),
    params: t.Object({ ...workspace, sessionId: t.String() }), query: t.Object(page),
    response: { 200: t.Object({ data: t.Array(t.Unknown()), pagination }), 404: error },
  },
  createRun: {
    detail: { ...details("createRun", "Start a run", "Sends a message, or answers the agent's questions (`resume`), and streams the run. The body is an AG-UI `RunAgentInput`, as `useChat` sends it.", "Runs"), responses: { 200: stream } },
    params: t.Object({ ...workspace, sessionId: t.String() }),
  },
  listEvents: {
    detail: { ...details("listEvents", "Follow the current run", "Rejoins the conversation's current run from its durable position, as `useChat` does after a reload.", "Runs"), responses: { 200: stream } },
    params: t.Object({ ...workspace, sessionId: t.String() }),
    query: t.Object({ runId: t.Optional(t.String()), offset: t.Optional(t.String()) }),
  },
  updateRun: {
    detail: details("updateRun", "Cancel a run", "Asks the agent to stop the conversation's current run. The stream confirms when it has stopped.", "Runs"),
    params: t.Object({ ...workspace, sessionId: t.String(), runId: t.String() }),
    body: t.Object({ status: t.Literal("cancelled") }),
    response: { 202: t.Object({ id: t.String(), status: t.Literal("cancelling") }), 404: error },
  },
};
