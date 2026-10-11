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

test("saved evaluation findings open without starting an authoring or evaluation turn", async ({ page }) => {
  const posts: string[] = [];
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") posts.push(path);
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    if (path.endsWith("/sessions/saved")) return route.fulfill({ json: {
      session: { sessionId: "saved" }, messages: [],
    } });
    if (path.endsWith("/report")) return route.fulfill({ json: { root: draft.root, report: {
      version: 1, directory: "/evidence", materialHash: "hash", lessonIds: ["001-first"],
      status: "teaching-failed", stage: "teaching", startedAt: "start", completedAt: "end",
      teaching: [{ judge: "Independent judge", root: "/judge", promptHash: "hash", verdict: {
        overall: "fail", limitation: "Simulated learners only.", criteria: [{
          id: "adaptive-instruction", pass: false,
          evidence: "Repeated an unexplained term.",
          improvement: "Explain the missing concept before asking again.",
        }],
      } }],
    } } });
    return route.fulfill({ contentType: "text/event-stream", body: "" });
  });
  await page.goto("/authoring?session=saved");
  await page.getByRole("button", { name: "Report", exact: true }).click();
  const report = page.getByRole("region", { name: "Teaching evaluation report" });
  await expect(report).toBeVisible();
  await expect(report).toContainText("Teaching needs revision");
  await expect(report.getByText("Repeated an unexplained term.")).toBeVisible();
  await expect(report.getByText("Explain the missing concept before asking again.")).toBeVisible();
  await report.locator("summary").click();
  await expect(report.getByText("Repeated an unexplained term.")).toBeHidden();
  await page.getByRole("button", { name: "Hide report", exact: true }).click();
  await expect(report).toHaveCount(0);
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await expect(report).toBeVisible();
  expect(posts).toEqual([]);
});

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
  const streamPath = "/api/authoring/eve/sessions/eve-1/messages";
  const responses: number[] = [];
  const failures: string[] = [];
  page.on("response", response => {
    if (new URL(response.url()).pathname === streamPath) responses.push(response.status());
  });
  page.on("requestfailed", request => {
    if (new URL(request.url()).pathname === streamPath) failures.push(request.failure()?.errorText ?? "unknown");
  });
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
  // Mount cleanup may abort an observer before reconnecting. It must not
  // leave two successful streams or create a new agent turn.
  await expect.poll(() => responses.length + failures.length).toBe(
    calls.filter(call => call === `GET ${streamPath}`).length,
  );
  expect(responses).toEqual([200]);
  expect(failures.every(failure => failure === "net::ERR_ABORTED")).toBe(true);
});

for (const failureCount of [0, 1, 2]) {
test(`Eve authoring restores and answers without ACP (failures=${failureCount})`, async ({ page }) => {
  const calls: string[] = [];
  const submissions: unknown[] = [];
  let releaseRetry: (() => void) | undefined;
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
        if (submissions.length > 1) {
          await new Promise<void>(resolve => { releaseRetry = resolve; });
        }
        if (submissions.length <= failureCount) {
          return route.fulfill({ status: 503, json: { error: "Interrupt continuation could not be started." } });
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
  for (let attempt = 1; attempt <= failureCount; attempt++) {
    await expect(page.getByTestId("authoring-chat-pane").getByRole("alert")).toBeVisible();
    await expect(review).toHaveAttribute("aria-checked", "true");
    expect(submissions).toHaveLength(attempt);
    await expect(page.getByRole("button", { name: "Retry answer", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Retry answer", exact: true }).click();
    await expect.poll(() => submissions.length).toBe(attempt + 1);
    // Keep the network request pending: stale errors and disabled retry buttons
    // must not linger while the original answer is being resubmitted.
    await expect(page.getByTestId("authoring-chat-pane").getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry answer", exact: true })).toHaveCount(0);
    expect(submissions[attempt]).toEqual(submissions[0]);
    releaseRetry?.();
  }
  await expect(page.getByText("Let us review your outline together.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry answer", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("authoring-chat-pane").getByRole("alert")).toHaveCount(0);
  await expect(review).toHaveAttribute("aria-checked", "true");
  expect(calls.filter(call => call === "POST /api/authoring/eve/sessions")).toHaveLength(1);
  expect(calls.filter(call => call === "POST /api/authoring/eve/sessions/eve-1/messages")).toHaveLength(failureCount + 1);
  expect(calls.some(call => /\/authoring\/(session|workspace|introduction|answers|messages)$/.test(call))).toBe(false);
});
}
