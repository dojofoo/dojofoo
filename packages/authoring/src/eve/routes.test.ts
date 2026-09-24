import { Client, type MessageStreamEvent } from "@dojofoo/agent/client";
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEveAuthoringRoutes } from "./routes";

const meta = { at: "2026-09-12T12:00:00.000Z", id: "event", deliveryIds: ["delivery-1"] };
const wait: MessageStreamEvent = { type: "session.waiting", data: { continuationToken: "session-1", wait: "next-user-message" }, meta };
const action = { callId: "call-1", kind: "tool-call" as const, toolName: "dojo_ui_ask", input: {} };
const data = { sequence: 1, stepIndex: 0, turnId: "turn-1" };

function fixture() {
  let history: MessageStreamEvent[] = [
    { type: "actions.requested", data: { ...data, actions: [action] }, meta },
    { type: "input.requested", data: { ...data, requests: [{ action, requestId: "question-1", kind: "question", prompt: "Review?", options: [{ id: "review", label: "Review" }] }] }, meta }, wait,
  ];
  const requests: Array<{ url: URL; body?: Record<string, unknown> }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
    const url = new URL(String(input));
    const body = options?.body ? JSON.parse(String(options.body)) : undefined;
    requests.push({ url, body });
    if (url.pathname.endsWith("/cancel")) return Response.json({ ok: true, status: "accepted", sessionId: "session-1" });
    if (options?.method === "POST") {
      if (url.pathname === "/eve/v1/session") history = [];
      if (body.inputResponses) history.push({ type: "input.resolved", data: { ...data, resolutions: [{ kind: "question", outcome: "answered", requestId: "question-1", response: body.inputResponses[0] }] }, meta });
      else history.push({ type: "message.received", data: { sequence: 2, turnId: "turn-2", message: body.message }, meta });
      history.push({ type: "message.completed", data: { ...data, message: "Continue with the review.", finishReason: "stop" }, meta }, wait);
      return Response.json({ sessionId: "session-1", deliveryId: "delivery-1" });
    }
    const start = Number(url.searchParams.get("startIndex") ?? 0);
    return new Response(history.slice(start).map((event, index) => JSON.stringify({ ...event, meta: { ...event.meta, id: `event-${start + index}` } })).join("\n") + "\n", { headers: {
      "content-type": "application/x-ndjson", "x-eve-stream-version": "25",
      "x-eve-stream-tail-index": String(history.length - 1),
    } });
  });
  return { app: createEveAuthoringRoutes(new Client({ host: "http://eve-fixture.local" })), requests };
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Eve authoring HTTP routes using the real Eve client", () => {
  it("accepts TanStack's real AG-UI transport without a custom message field", async () => {
    const { app, requests } = fixture();
    const connection = fetchServerSentEvents("http://authoring.local/sessions", {
      fetchClient: async (input, options) => app.fetch(new Request(input, options)),
    });
    const events: string[] = [];
    const chat = new ChatClient({ connection, onChunk: event => { events.push(event.type); } });
    await chat.sendMessage("Help me author this course.");
    expect(events).toContain("RUN_FINISHED");
    expect(requests.filter(request => request.body).map(request => request.body?.message))
      .toEqual(["Help me author this course."]);
  });
  it("replays a settled session over a read-only SSE connection", async () => {
    const { app, requests } = fixture();
    const response = await app.request("/sessions/session-1/messages?runId=view-rejoin");
    const output = await response.text();
    expect(output).toContain('"runId":"view-rejoin"');
    expect(output).toContain("Review?");
    expect(output).toContain('"type":"interrupt"');
    expect(output).not.toContain("RUN_ERROR");
    expect(requests.filter(request => request.body)).toHaveLength(0);
  });

  it("supplies a read-only resume pointer after a completed answer as well", async () => {
    const { app } = fixture();
    await (await app.request("/sessions/session-1/answers", { method: "POST", body: JSON.stringify({ responses: [{ requestId: "question-1", optionId: "review" }] }) })).text();
    const response = await app.request("/sessions/session-1");
    expect((await response.json()).initialResumeSnapshot).toMatchObject({
      resumeState: { threadId: "session-1" }, pendingInterrupts: [],
    });
  });

  it("accepts AG-UI resume entries and retains the client's run correlation", async () => {
    const { app, requests } = fixture();
    const response = await app.request("/sessions/session-1/messages", {
      method: "POST", body: JSON.stringify({
        runId: "client-run-2", parentRunId: "client-run-1",
        resume: [{ interruptId: "question-1", status: "resolved", payload: { optionId: "review" } }],
      }),
    });
    expect(response.status).toBe(200);
    const output = await response.text();
    expect(output).toContain('"runId":"client-run-2"');
    expect(output).toContain("approval-responded");
    expect(requests.filter(request => request.body)).toEqual([expect.objectContaining({
      body: { inputResponses: [{ requestId: "question-1", optionId: "review" }] },
    })]);
  });

  it.each([
    { resume: [] },
    { resume: [{ interruptId: "question-1", status: "cancelled" }] },
    { resume: [{ interruptId: 42, status: "resolved", payload: {} }] },
  ])("rejects unsupported or malformed resume batches before contacting Eve", async ({ resume }) => {
    const { app, requests } = fixture();
    const response = await app.request("/sessions/session-1/messages", { method: "POST", body: JSON.stringify({ resume }) });
    expect(response.status).toBe(422);
    expect(requests).toHaveLength(0);
  });

  it("starts one Eve session and exposes its identity in the AG-UI stream", async () => {
    const { app, requests } = fixture();
    const response = await app.request("/sessions", { method: "POST", body: JSON.stringify({ message: "Introduce the course" }) });
    const streamed = await response.text();
    expect(streamed).toContain('"threadId":"session-1"');
    expect(streamed).toContain("Introduce the course");
    expect(streamed).toContain("RUN_FINISHED");
    expect(requests.filter(request => request.body)).toHaveLength(1);
    expect(requests[0].url.pathname).toBe("/eve/v1/session");
  });

  it("sends to the existing session while retaining its prior question", async () => {
    const { app, requests } = fixture();
    const response = await app.request("/sessions/session-1/messages", { method: "POST", body: JSON.stringify({ message: "Explain the prerequisites" }) });
    const streamed = await response.text();
    expect(streamed).toContain("Review?");
    expect(streamed).toContain("Explain the prerequisites");
    expect(streamed).toContain("RUN_FINISHED");
    const posts = requests.filter(request => request.body);
    expect(posts).toHaveLength(1);
    expect(posts[0].url.pathname).toBe("/eve/v1/session/session-1");
    expect(requests.at(-1)?.url.searchParams.get("startIndex")).toBe("3");
  });

  it("hydrates questions directly from the authoritative session snapshot", async () => {
    const { app } = fixture();
    const response = await app.request("/sessions/session-1");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.session).toEqual({ sessionId: "session-1", streamIndex: 3 });
    expect(body.messages[0].parts[0]).toMatchObject({ type: "tool-call", state: "approval-requested" });
    expect(body.initialResumeSnapshot).toMatchObject({
      resumeState: { threadId: "session-1", runId: "session-1:3" },
      pendingInterrupts: [{ id: "question-1", reason: "generic" }],
    });
  });

  it("answers from the saved tail and streams the continuation rather than an old turn", async () => {
    const { app, requests } = fixture();
    const responses = [{ requestId: "question-1", optionId: "review" }];
    const response = await app.request("/sessions/session-1/answers", { method: "POST", body: JSON.stringify({ responses }) });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const streamed = await response.text();
    expect(streamed).toContain("RUN_FINISHED");
    expect(streamed).toContain("Continue with the review.");
    expect(streamed).toContain("approval-responded");
    expect(requests.filter(request => request.body)).toEqual([expect.objectContaining({ body: { inputResponses: responses } })]);
    expect(requests.at(-1)?.url.searchParams.get("startIndex")).toBe("3");
  });

  it("validates empty input without starting or replacing a session", async () => {
    const { app, requests } = fixture();
    for (const [path, body] of [["/sessions", { message: " " }], ["/sessions", null], ["/sessions", { message: "Hello", runId: 42 }], ["/sessions/session-1/messages", { message: "Hello", runId: "" }], ["/sessions/session-1/answers", { responses: [] }]]) {
      expect((await app.request(String(path), { method: "POST", body: JSON.stringify(body) })).status).toBe(422);
    }
    expect(requests).toHaveLength(0);
    expect((await app.request("/sessions", { method: "POST", body: "{" })).status).toBe(400);
  });

  it("preserves upstream status and error code instead of creating a replacement session", async () => {
    vi.useFakeTimers();
    const { app, requests } = fixture();
    vi.mocked(fetch).mockImplementation(async () => Response.json({ error: "Session unavailable", code: "session_not_found" }, { status: 404 }));
    const pending = app.request("/sessions/missing");
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "session_not_found" });
    expect(requests).toHaveLength(0);
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
  });

  it("uses Eve's explicit cancellation endpoint", async () => {
    const { app, requests } = fixture();
    const response = await app.request("/sessions/session-1/cancel", { method: "POST" });
    expect(await response.json()).toEqual({ status: "accepted", sessionId: "session-1" });
    expect(requests[0].url.pathname).toBe("/eve/v1/session/session-1/cancel");
  });
});
