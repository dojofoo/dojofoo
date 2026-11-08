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
const lifecycle = t.Object({
  status: t.Union([t.Literal("idle"), t.Literal("working"), t.Literal("paused"), t.Literal("interrupted")]),
  turnId: t.Optional(t.String()),
  beginPending: t.Optional(t.Object({ idempotencyKey: t.String(), sentAt: t.String(), attempt: t.Optional(t.Integer({ minimum: 0 })), cancelledAt: t.Optional(t.String()), deliveryId: t.Optional(t.String()) })),
  resumeFailedAt: t.Optional(t.String()),
  heldReport: t.Optional(t.Object({ observationId: t.String(), text: t.String(), heldAt: t.String() }, { description: "A check report waiting for the session to become idle." })),
  sentReport: t.Optional(t.Object({ observationId: t.String(), deliveryId: t.Optional(t.String()), sentAt: t.String(), seenAt: t.Optional(t.String()) })),
  interruptedAt: t.Optional(t.String({ description: "An agent switch timed out on this session's turn; the turn shows as stopped." })),
  interruptedTurnId: t.Optional(t.String()),
  updatedAt: t.String(),
}, { description: "Whether the session's turn is idle, working or waiting on the learner." });
const sessionSummary = {
  id: t.String(),
  agent: t.String({ description: "The coding agent's ID.", examples: ["codex"] }),
  persona,
  createdAt: t.String(),
  courseId: t.Optional(t.String({ description: "The course a Sensei conversation teaches." })),
  lessonId: t.Optional(t.String({ description: "The kata lesson a Sensei conversation teaches." })),
  model: t.Optional(t.String({ description: "The coding agent's model for this conversation; the agent's own default when absent." })),
  effort: t.Optional(t.String({ description: "The model's effort for this conversation (a level the agent lists for the model); the model's default when absent." })),
  revision: t.Optional(t.Integer({ minimum: 0, description: "Raised by every model or effort change." })),
  endedAt: t.Optional(t.String()),
  replacedBy: t.Optional(t.String({ description: "The conversation that replaced this one." })),
  firstMessage: t.Optional(t.String({ description: "The opening of the conversation's first learner or author message, at most 80 characters." })),
  unavailable: t.Optional(t.Literal(true, { description: "The conversation was found stranded or its data gone; it can't be opened again." })),
  lifecycle: t.Optional(lifecycle),
};
const modelChoice = t.Object({
  id: t.String({ examples: ["openai/gpt-4o"] }),
  name: t.String({ description: "The agent's own name for the model, with its version where the agent gives one.", examples: ["Opus 5.5"] }),
  description: t.Optional(t.String({ description: "The agent's one-line description of the model." })),
  efforts: t.Array(t.String()),
  defaultEffort: t.Optional(t.String()),
  unavailable: t.Optional(t.String({ description: "Why the agent can't run the model now; absent when it can.", examples: ["Sign in to GitHub Copilot again"] })),
});
const authType = t.Union([t.Literal("api_key"), t.Literal("oauth")], { description: "Pi's AuthType: an API key, or a browser or device-code sign-in." });
const accessProvider = t.Object({
  id: t.String({ examples: ["github-copilot"] }),
  name: t.String({ examples: ["GitHub Copilot"] }),
  auth: t.Object({
    apiKey: t.Optional(t.Object({ name: t.String(), login: t.Boolean({ description: "Whether a key can be entered here." }) })),
    oauth: t.Optional(t.Object({ name: t.String(), loginLabel: t.Optional(t.String()), isSubscription: t.Optional(t.Boolean()) })),
  }),
  status: t.Object({
    configured: t.Boolean({ description: "Signed in, by a stored login, the environment or the agent's own configuration." }),
    source: t.Optional(t.String({ examples: ["stored", "environment"] })),
    label: t.Optional(t.String({ examples: ["OAuth", "DEEPSEEK_API_KEY"] })),
  }),
}, { description: "One provider a coding agent can sign in to, as Pi describes it." });
const text = (type: "text" | "secret" | "manual_code") =>
  t.Object({ type: t.Literal(type), message: t.String(), placeholder: t.Optional(t.String()), id: t.String() });
const authPrompt = t.Union([text("text"), text("secret"), text("manual_code"),
  t.Object({ type: t.Literal("select"), message: t.String(), id: t.String(),
    options: t.Array(t.Object({ id: t.String(), label: t.String(), description: t.Optional(t.String()) })) })],
{ description: "The question the sign-in waits on; answer it by its id." });
const authEvent = t.Union([
  t.Object({ type: t.Literal("info"), message: t.String(), links: t.Optional(t.Array(t.Object({ url: t.String(), label: t.Optional(t.String()) }))) }),
  t.Object({ type: t.Literal("auth_url"), url: t.String(), instructions: t.Optional(t.String()) }),
  t.Object({ type: t.Literal("device_code"), userCode: t.String(), verificationUri: t.String(), intervalSeconds: t.Optional(t.Number()), expiresInSeconds: t.Optional(t.Number()) }),
  t.Object({ type: t.Literal("progress"), message: t.String() }),
]);
const loginState = t.Object({
  id: t.String(),
  agent: t.String(),
  provider: t.String(),
  type: authType,
  status: t.Union([t.Literal("running"), t.Literal("succeeded"), t.Literal("failed"), t.Literal("cancelled")]),
  events: t.Array(authEvent, { description: "What the sign-in has shown, in order: a page to open, a code to enter, progress." }),
  prompt: t.Optional(authPrompt),
  error: t.Optional(t.String()),
}, { description: "A sign-in, as Pi's login interaction reports it." });
const login = { ...workspace, loginId: t.String() };
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
    response: { 202: agent, 404: error, 409: t.Object({ error: t.String({ description: "agent_unavailable, agent_not_offered, or agent_switching while a switch of this workspace's coding agent is in progress." }), message: t.String() }) },
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
  listModels: {
    detail: details("listModels", "List a coding agent's models", "The models a coding agent offers, as its own CLI lists them.", "Agents"),
    params: t.Object({ ...workspace, agentId: t.String() }), query: t.Object(page),
    response: { 200: t.Object({ data: t.Array(modelChoice), pagination }), 404: error, 502: error },
  },
  listProviders: {
    detail: details("listProviders", "List a coding agent's sign-in providers", "The providers a coding agent can sign in to, and whether it is signed in to each, in Pi's terms. Empty while Dojo can't sign in to the agent; its own CLI is then the way in.", "Agents"),
    params: t.Object({ ...workspace, agentId: t.String() }), query: t.Object(page),
    response: { 200: t.Object({ data: t.Array(accessProvider), pagination }), 404: error, 502: error },
  },
  startLogin: {
    detail: details("startLogin", "Start a sign-in", "Starts signing the coding agent in to a provider. The agent saves the login where it keeps its own. Poll getLogin for the page to open or the question to answer. Only the UI's own pages can call it: it takes the page's launch token.", "Agents"),
    params: t.Object({ ...workspace, agentId: t.String() }),
    body: t.Object({ provider: t.String({ minLength: 1 }), type: authType }, { additionalProperties: false }),
    response: { 201: loginState, 400: error, 403: error, 404: error, 409: error, 502: error },
  },
  getLogin: {
    detail: details("getLogin", "Get a sign-in", "A sign-in's events, its waiting question and how it ended. Takes the page's launch token.", "Agents"),
    params: t.Object(login),
    response: { 200: loginState, 403: error, 404: error },
  },
  answerLogin: {
    detail: details("answerLogin", "Answer a sign-in's question", "Answers the question a sign-in waits on: text, an API key, a choice's id or a pasted code. The answer goes to the coding agent and is not kept. Takes the page's launch token.", "Agents"),
    params: t.Object(login),
    body: t.Object({ prompt: t.String({ minLength: 1 }), value: t.String() }, { additionalProperties: false }),
    response: { 200: loginState, 403: error, 404: error, 409: error },
  },
  cancelLogin: {
    detail: details("cancelLogin", "Cancel a sign-in", "Stops a running sign-in. Takes the page's launch token.", "Agents"),
    params: t.Object(login),
    response: { 200: loginState, 403: error, 404: error },
  },
  listSessions: {
    detail: details("listSessions", "List sessions", "A workspace's conversations, newest first, optionally for one coding agent or persona.", "Sessions"),
    params: t.Object(workspace),
    query: t.Object({ ...page, agent: t.Optional(t.String({ description: "A coding agent's ID." })), persona: t.Optional(persona),
      course: t.Optional(t.String({ description: "Only the conversations of this course." })),
      lesson: t.Optional(t.String({ description: "Only the conversations of this lesson; empty for those without a lesson." })) }),
    response: { 200: t.Object({ data: t.Array(t.Object(sessionSummary)), pagination }), 404: error },
  },
  openDefaultSession: {
    detail: details("openDefaultSession", "Open a page's default conversation", "Gets or creates the conversation a page opens: on a Sensei page the newest usable one for the course (and lesson), on a draft's page Kyoshi's newest usable one, on the selected coding agent; else a new one that starts with a hidden begin turn. A draft's request names no course or lesson; a Sensei page's names its course. `session` is honoured when it belongs to the page; `new` with `from` replaces that conversation once. Only the UI's own pages can call it: it takes the page's launch token.", "Sessions"),
    params: t.Object(workspace),
    body: t.Object({
      course: t.Optional(t.String({ minLength: 1 })),
      lesson: t.Optional(t.String({ minLength: 1 })),
      session: t.Optional(t.String({ minLength: 1 })),
      new: t.Optional(t.Literal(true)),
      from: t.Optional(t.String({ minLength: 1 })),
    }),
    response: {
      200: t.Object({ session: t.Object(sessionSummary), rewrite: t.Boolean(), notice: t.Optional(t.Literal("picked-unavailable")) }),
      400: error, 403: error, 404: error, 409: error, 503: error,
    },
  },
  getSession: {
    detail: details("getSession", "Get a session", "A conversation's coding agent and persona.", "Sessions"),
    params: t.Object({ ...workspace, sessionId: t.String() }),
    response: { 200: t.Object(sessionSummary), 404: error },
  },
  updateSession: {
    detail: details("updateSession", "Change a session's model or effort", "Sets the conversation's model and/or effort from its next turn and remembers them as the workspace's last for that coding agent. Refused while Sensei waits on the learner's answer.", "Sessions"),
    params: t.Object({ ...workspace, sessionId: t.String() }),
    // `effort: null` clears it, for a model that does not take the effort chosen before
    body: t.Object({ model: t.Optional(t.String({ minLength: 1 })), effort: t.Optional(t.Union([t.String({ minLength: 1 }), t.Null()])) }, { additionalProperties: false, minProperties: 1 }),
    response: { 200: t.Object(sessionSummary), 400: error, 404: error, 409: error },
  },
  eve: {
    detail: details("eve", "Talk to the session", "The session's own Eve routes (`/eve/v1/session/{sessionId}/…`: its stream, messages, answers, cancel), as Eve's client calls them. Pass this session's URL as `baseUrl` to `useEveAgent` or `eve/client`. A Sensei session refuses `clear` and `compact` with 409 `control_refused`.", "Sessions"),
    params: t.Object({ ...workspace, sessionId: t.String(), "*": t.String() }),
    parse: "none" as const,
  },
};
