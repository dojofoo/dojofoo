import { t } from "elysia";
import { personas } from "./runtime";

// The public Course API's conventions: `{ error, message }` errors, `{ data, pagination }`
// collections with zero-based `page` and `per_page`, verb-noun operation IDs.
const count = () => t.Integer({ minimum: 0 });
export const error = t.Object({ error: t.String(), message: t.String() }, { additionalProperties: false });
const pagination = t.Object({ page: count(), perPage: t.Integer(), total: count(), hasMore: t.Boolean() });
const persona = t.Union([t.Literal(personas[0]), t.Literal(personas[1])], {
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
const details = (operationId: string, summary: string, description: string, tag: string) => ({ operationId, summary, description, tags: [tag] });
const page = {
  page: t.Optional(t.Numeric({ minimum: 0, default: 0, description: "Zero-based page number." })),
  per_page: t.Optional(t.Numeric({ minimum: 1, maximum: 500, default: 100, description: "Items per page." })),
};

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
  selectAgent: {
    detail: details("selectAgent", "Select a coding agent", "Makes this the workspace's coding agent, for both personas. First cancels the old agent's turns and stops its host; its sessions are kept. Selecting the current agent changes nothing. Only the UI's own pages can call it: it takes the page's launch token.", "Agents"),
    params: t.Object({ ...workspace, agentId: t.String() }),
    response: { 200: agent, 403: error, 404: error, 409: error },
  },
  listSessions: {
    detail: details("listSessions", "List sessions", "A workspace's conversations, newest first, optionally for one coding agent or persona.", "Sessions"),
    params: t.Object(workspace),
    query: t.Object({ ...page, agent: t.Optional(t.String({ description: "A coding agent's ID." })), persona: t.Optional(persona) }),
    response: { 200: t.Object({ data: t.Array(t.Object(sessionSummary)), pagination }), 404: error },
  },
  createSession: {
    detail: details("createSession", "Create a session", "Starts a conversation on a coding agent (the workspace's selected one by default), with the persona the workspace's kind runs: Kyoshi for a draft, Sensei otherwise. A `persona` in the body is ignored. Its first run starts with `message`, or the persona's greeting.", "Sessions"),
    params: t.Object(workspace),
    body: t.Object({ persona: t.Optional(persona), agent: t.Optional(t.String()), message: t.Optional(t.String({ minLength: 1 })),
      clientContext: t.Optional(t.Record(t.String(), t.Unknown(), { description: "Page context for the first turn, as Eve's `clientContext`: the agent sees it, the conversation doesn't keep it." })),
    }),
    response: { 201: t.Object(sessionSummary), 404: error, 409: error },
  },
  getSession: {
    detail: details("getSession", "Get a session", "A conversation's coding agent and persona.", "Sessions"),
    params: t.Object({ ...workspace, sessionId: t.String() }),
    response: { 200: t.Object(sessionSummary), 404: error },
  },
  eve: {
    detail: details("eve", "Talk to the session", "The session's own Eve routes (`/eve/v1/session/{sessionId}/…`: its stream, messages, answers, cancel), as Eve's client calls them. Pass this session's URL as `baseUrl` to `useEveAgent` or `eve/client`.", "Sessions"),
    params: t.Object({ ...workspace, sessionId: t.String(), "*": t.String() }),
    parse: "none" as const,
  },
};
