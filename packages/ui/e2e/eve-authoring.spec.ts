import { expect, test } from "@playwright/test";
import { defaultMessageReducer, type MessageStreamEvent } from "@dojofoo/agent/client";
import { eveChatMessages } from "@dojofoo/authoring/eve/messages";
import { eveQuestionInterrupts, streamEveAsAgUi } from "@dojofoo/authoring/eve/stream";
import { toServerSentEventsResponse } from "@tanstack/ai";

const draft = { root: "/tmp/eve-course", style: "katas", name: "Eve course", description: "Author a course together", language: "TypeScript", manifestSource: "name: Eve course\n", courseGuidance: "# Course", rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: "name: Eve course\n" }], lessons: [], issues: [], courseChecks: [] };
const action = { callId: "call-review", kind: "tool-call" as const, toolName: "dojo_ui_ask", input: {} };
const data = { sequence: 1, turnId: "turn-1", stepIndex: 0 };
const meta = { id: "fixture", at: "2026-09-13T00:00:00Z" };
const wait: MessageStreamEvent = { type: "session.waiting", data: { continuationToken: "eve-1", wait: "next-user-message" }, meta };
const opening: MessageStreamEvent[] = [
  { type: "message.received", data: { ...data, message: "Help me author this course" }, meta },
  { type: "message.completed", data: { ...data, message: "Which concept should we teach first?", finishReason: "stop" }, meta },
  { type: "actions.requested", data: { ...data, actions: [action] }, meta },
  { type: "input.requested", data: { ...data, requests: [{ action, requestId: "question-review", kind: "question", prompt: "Choose a starting point", display: "select", options: [{ id: "review", label: "Review the outline" }, { id: "write", label: "Write a lesson" }] }] }, meta }, wait,
];

test("an unavailable Eve session reports the error without creating a replacement", async ({ page }) => {
  const posts: string[] = [];
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") posts.push(path);
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    return route.fulfill({ status: 404, json: { error: "Session unavailable", code: "session_not_found" } });
  });
  await page.goto("/authoring?session=missing");
  await expect(page.getByRole("alert")).toContainText("Session unavailable");
  await expect(page).toHaveURL(/session=missing/);
  expect(posts).toEqual([]);
});

test("an active Eve session rejoins read-only and displays the continuing response", async ({ page }) => {
  const reducer = defaultMessageReducer();
  const prefix: MessageStreamEvent[] = [
    opening[0]!,
    { type: "message.appended", data: { ...data, messageDelta: "Reviewing " }, meta },
  ];
  const projection = prefix.reduce(reducer.reduce, reducer.initial());
  const calls: string[] = [];
  let joined!: () => void;
  const connection = new Promise<void>(resolve => { joined = resolve; });
  let finish!: () => void;
  const continuing = new Promise<void>(resolve => { finish = resolve; });
  await page.route("**/api/authoring/**", async route => {
    const url = new URL(route.request().url());
    calls.push(`${route.request().method()} ${url.pathname}`);
    if (url.pathname.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (url.pathname.endsWith("/draft")) return route.fulfill({ json: draft });
    if (url.pathname.endsWith("/sessions/eve-1")) return route.fulfill({ json: {
      session: { sessionId: "eve-1", streamIndex: 2 }, messages: eveChatMessages(projection.messages),
      initialResumeSnapshot: { resumeState: { threadId: "eve-1", runId: "eve-1:2" }, pendingInterrupts: [] },
    } });
    if (url.pathname.endsWith("/sessions/eve-1/messages") && route.request().method() === "GET") {
      joined();
      await continuing;
      async function* events() {
        yield* prefix;
        yield { type: "message.completed", data: { ...data, message: "Reviewing the outline is complete.", finishReason: "stop" }, meta } as MessageStreamEvent;
        yield wait;
      }
      const response = toServerSentEventsResponse(streamEveAsAgUi({ events: events(), initial: reducer.initial(), threadId: "eve-1", runId: url.searchParams.get("runId")! }));
      return route.fulfill({ contentType: "text/event-stream", body: await response.text() });
    }
    return route.fulfill({ status: 500, json: { error: "Unexpected mutation" } });
  });
  await page.goto("/authoring?session=eve-1");
  await expect(page.getByText("Reviewing", { exact: true })).toBeVisible();
  await connection;
  finish();
  await expect(page.getByText("Reviewing the outline is complete.", { exact: true })).toBeVisible();
  expect(calls.every(call => call.startsWith("GET "))).toBe(true);
  expect(calls.filter(call => call === "GET /api/authoring/eve/sessions/eve-1/messages")).toHaveLength(1);
});

for (const failFirstAnswer of [false, true]) {
test(`Eve authoring restores and answers without ACP (retry=${failFirstAnswer})`, async ({ page }) => {
  const calls: string[] = [];
  const submissions: unknown[] = [];
  const reducer = defaultMessageReducer();
  let projection = reducer.initial();
  await page.route("**/api/authoring/**", async route => {
    const path = new URL(route.request().url()).pathname;
    calls.push(`${route.request().method()} ${path}`);
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    if (path.endsWith("/sessions/eve-1") && route.request().method() === "GET") {
      return route.fulfill({ json: {
        session: { sessionId: "eve-1", streamIndex: 5 }, messages: eveChatMessages(projection.messages),
        initialResumeSnapshot: { resumeState: { threadId: "eve-1", runId: "hydrated-run" }, pendingInterrupts: eveQuestionInterrupts(projection, "hydrated-run") },
      } });
    }
    if (path.endsWith("/sessions") || path.endsWith("/sessions/eve-1/messages")) {
      const body = route.request().postDataJSON();
      if (body.resume) {
        submissions.push(body.resume);
        if (failFirstAnswer && submissions.length === 1) {
          return route.fulfill({ status: 503, json: { error: "Answer service temporarily unavailable" } });
        }
      }
      const source: MessageStreamEvent[] = body.resume ? [
        { type: "input.resolved", data: { ...data, resolutions: [{ kind: "question", requestId: "question-review", outcome: "answered", response: { requestId: "question-review", optionId: "review" } }] }, meta },
        { type: "message.completed", data: { sequence: 2, turnId: "turn-2", stepIndex: 0, message: "Let us review your outline together.", finishReason: "stop" }, meta }, wait,
      ] : opening;
      if (body.resume) expect(body.resume[0]).toMatchObject({ interruptId: "question-review", status: "resolved", payload: { optionId: "review" } });
      async function* events() { yield* source; }
      const response = toServerSentEventsResponse(streamEveAsAgUi({ events: events(), initial: projection, threadId: "eve-1", runId: body.runId }));
      const text = await response.text();
      projection = source.reduce(reducer.reduce, projection);
      return route.fulfill({ contentType: "text/event-stream", body: text });
    }
    return route.fulfill({ status: 500, json: { error: `Unexpected ACP request: ${path}` } });
  });
  await page.goto("/authoring");
  await expect.poll(() => calls.filter(call => call === "POST /api/authoring/eve/sessions").length).toBe(1);
  await expect(page.getByText("Which concept should we teach first?", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/session=eve-1/);
  expect(calls.filter(call => call === "POST /api/authoring/eve/sessions")).toHaveLength(1);
  await page.reload();
  const review = page.getByRole("radio", { name: /Review the outline/ });
  await expect(review).toBeVisible();
  await review.click();
  if (failFirstAnswer) {
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(review).toHaveAttribute("aria-checked", "true");
    expect(submissions).toHaveLength(1);
    await page.getByRole("button", { name: "Retry answer", exact: true }).click();
  }
  await expect(page.getByText("Let us review your outline together.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry answer", exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  if (failFirstAnswer) expect(submissions[1]).toEqual(submissions[0]);
  await expect(review).toHaveAttribute("aria-checked", "true");
  expect(calls.filter(call => call === "POST /api/authoring/eve/sessions")).toHaveLength(1);
  expect(calls.filter(call => call === "POST /api/authoring/eve/sessions/eve-1/messages")).toHaveLength(failFirstAnswer ? 2 : 1);
  expect(calls.some(call => /\/authoring\/(session|workspace|introduction|answers|messages)$/.test(call))).toBe(false);
});
}
