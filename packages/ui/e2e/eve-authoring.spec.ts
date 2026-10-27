import { expect, test } from "@playwright/test";
import { defaultMessageReducer, type MessageStreamEvent } from "@dojofoo/agent/client";
import { eveChatMessages } from "@dojofoo/authoring/eve/messages";
import { eveQuestionInterrupts, streamEveAsAgUi } from "@dojofoo/authoring/eve/stream";
import { chatParamsFromRequestBody, convertMessagesToModelMessages, toServerSentEventsResponse } from "@tanstack/ai";

const draft = { root: "/tmp/eve-course", style: "katas", name: "Eve course", description: "Author a course together", language: "TypeScript", manifestSource: "name: Eve course\n", courseGuidance: "# Course", rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: "name: Eve course\n" }], lessons: [], issues: [], courseChecks: [] };
const action = { callId: "call-review", kind: "tool-call" as const, toolName: "dojo_ui_ask", input: {} };
const data = { sequence: 1, turnId: "turn-1", stepIndex: 0 };
const meta = { id: "fixture", at: "2026-09-13T00:00:00Z" };
const wait: MessageStreamEvent = { type: "session.waiting", data: { continuationToken: "eve-1", wait: "next-user-message" }, meta };
const opening: MessageStreamEvent[] = [
  { type: "message.received", data: { ...data, message: "[dojo:begin-authoring]" }, meta },
  { type: "message.completed", data: { ...data, message: "Which concept should we teach first?", finishReason: "stop" }, meta },
  { type: "actions.requested", data: { ...data, actions: [action] }, meta },
  { type: "input.requested", data: { ...data, requests: [{ action, requestId: "question-review", kind: "question", prompt: "Choose a starting point", display: "select", options: [{ id: "review", label: "Review the outline" }, { id: "write", label: "Write a lesson" }] }] }, meta }, wait,
];

test("Pages navigation filters nested authoring files and preserves selection across renames", async ({ page }) => {
  let current = { ...draft, rootFiles: [...draft.rootFiles,
    { path: "package.json", label: "package.json", content: "{}" },
    { path: ".agents/skills/course/SKILL.md", label: "SKILL.md", content: "# Real guidance" },
  ], lessons: [{ id: "first", title: "First lesson", senseiPath: "src/first/SENSEI.md", description: "", checks: [],
    files: [{ path: "src/first/SENSEI.md", label: "SENSEI.md", content: "# Teach" }] }] };
  const renames: unknown[] = [];
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: current });
    if (path.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" }, messages: [] } });
    if (route.request().method() === "PATCH") {
      const { title } = route.request().postDataJSON();
      renames.push({ path, title });
      current = path.endsWith("/course") ? { ...current, name: title }
        : { ...current, lessons: current.lessons.map(lesson => ({ ...lesson, title })) };
      return route.fulfill({ json: current });
    }
    return route.fulfill({ status: 404, json: { error: "Unexpected request" } });
  });
  await page.goto("/authoring?session=saved");
  await expect(page.getByRole("tab", { name: "dojo.yaml", exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Main menu" });
  await expect(navigation.getByRole("tree")).toHaveCount(0);
  await expect(navigation.locator("button button")).toHaveCount(0);
  await expect(navigation.getByRole("button", { name: "package.json", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Course actions", exact: true }).click();
  const boxStyle = (node: Element) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, radius: style.borderRadius, shadow: style.boxShadow };
  };
  const menuStyle = await page.getByRole("dialog").evaluate(boxStyle);
  await page.getByRole("menuitemradio", { name: "Show all files", exact: true }).click();
  for (const name of [".agents", "skills", "course"]) await navigation.getByRole("button", { name, exact: true }).click();
  await navigation.getByRole("button", { name: "SKILL.md", exact: true }).click();
  const tab = page.getByRole("tab", { name: "SKILL.md", exact: true });
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("# Real guidance");
  const rename = async (from: string, to: string) => {
    await navigation.getByRole("button", { name: from, exact: true }).hover();
    await navigation.getByRole("button", { name: `Rename ${from}`, exact: true }).click();
    const popup = page.getByRole("dialog");
    expect(await popup.evaluate(boxStyle)).toEqual(menuStyle);
    await popup.getByRole("textbox", { name: "Title", exact: true }).fill(to);
    await page.screenshot({ path: test.info().outputPath(`rename-${from.replace(/\W+/gu, "-")}.png`), animations: "disabled" });
    await popup.getByRole("button", { name: "Rename", exact: true }).click();
    await expect(navigation.getByRole("button", { name: to, exact: true })).toBeVisible();
  };
  await rename("Eve course", "Renamed draft");
  await rename("First lesson", "Revised lesson");
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Course actions", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Show only course files", exact: true }).click();
  await expect(navigation.getByRole("button", { name: "SKILL.md", exact: true })).toHaveCount(0);
  await expect(tab).toHaveAttribute("aria-selected", "true");
  expect(renames).toEqual([
    { path: "/api/authoring/course", title: "Renamed draft" },
    { path: "/api/authoring/lessons/first", title: "Revised lesson" },
  ]);
  await page.screenshot({ path: test.info().outputPath("authoring-pages-navigation.png"), animations: "disabled" });
});

test("the Pages brief shows scoped readiness findings without an empty box", async ({ page }) => {
  const workspace = { ...draft, courseChecks: [
    { id: "intent", label: "Course intent and teaching rules", ready: true },
  ], lessons: [{ id: "first", title: "First lesson", senseiPath: "src/first/SENSEI.md", description: "A focused learner outcome", checks: [
    { id: "sensei", label: "Lesson briefing and Sensei guidance", ready: true },
    { id: "scaffold", label: "Learner scaffold and checks", ready: false, findings: ["Add a revealing edge case."] },
  ], files: [{ path: "src/first/SENSEI.md", label: "SENSEI.md", content: "# Teach" }] },
  { id: "empty", title: "Unchecked lesson", senseiPath: "src/empty/SENSEI.md", description: "No preflight result yet", checks: [],
    files: [{ path: "src/empty/SENSEI.md", label: "SENSEI.md", content: "# Draft" }] }] };
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: workspace });
    if (path.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" }, messages: [] } });
    if (path.endsWith("/report")) return route.fulfill({ json: { root: draft.root, report: null } });
    return route.fulfill({ status: 404, json: { error: "Unexpected request" } });
  });
  await page.goto("/authoring?session=saved");
  const readiness = page.getByRole("region", { name: "Readiness", exact: true });
  await expect(readiness).toContainText("Course intent and teaching rules");
  const nav = page.getByRole("navigation", { name: "Main menu" });
  const firstLesson = nav.getByRole("button", { name: "First lesson", exact: true });
  await expect(firstLesson).toHaveAttribute("aria-expanded", "true");
  await nav.locator('[id$="authoring:lesson:first-list"]').getByRole("button", { name: "SENSEI.md", exact: true }).click();
  await expect(readiness).toContainText("Add a revealing edge case.");
  await expect(readiness).not.toContainText("Course intent and teaching rules");
  await expect(readiness.getByRole("img", { name: "Ready", exact: true })).toHaveCount(1);
  await expect(readiness.getByRole("img", { name: "Needs attention", exact: true })).toHaveCount(1);
  expect(await readiness.evaluate(node => {
    const style = getComputedStyle(node);
    return { border: style.borderTopWidth, background: style.backgroundColor, overflows: node.scrollWidth > node.clientWidth };
  })).toEqual({ border: "0px", background: "rgba(0, 0, 0, 0)", overflows: false });
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("# Teach");
  await page.screenshot({ path: test.info().outputPath("authoring-readiness.png"), animations: "disabled" });
  await nav.getByRole("button", { name: "Unchecked lesson", exact: true }).click();
  await nav.locator('[id$="authoring:lesson:empty-list"]').getByRole("button", { name: "SENSEI.md", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Unchecked lesson", exact: true })).toBeVisible();
  await expect(readiness).toHaveCount(0);
});

test("reloading conversation history preserves the mounted editor and unsaved draft", async ({ page }) => {
  let repaired = false;
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    if (path.endsWith("/sessions/saved")) return repaired
      ? route.fulfill({ json: { session: { sessionId: "saved" }, messages: [] } })
      : route.fulfill({ status: 503, json: { error: "History temporarily unavailable" } });
    return route.fulfill({ status: 404, json: { error: "Unexpected request" } });
  });
  await page.goto("/authoring?session=saved");
  await expect(page.getByRole("button", { name: "Reload conversation" })).toBeVisible();
  const editor = page.getByRole("textbox", { name: "Code editor" });
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("# unsaved draft");
  const mounted = await page.locator(".monaco-editor[data-uri]").elementHandle();
  repaired = true;
  await page.getByRole("button", { name: "Reload conversation" }).click();
  await expect(page.getByRole("button", { name: "Reload conversation" })).toHaveCount(0);
  await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeEnabled();
  expect(await mounted!.evaluate(node => node.isConnected)).toBe(true);
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("# unsaved draft");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".monaco-editor .view-lines")).not.toContainText("# unsaved draft");
});

async function latestUserText(body: unknown) {
  const input = await chatParamsFromRequestBody(body);
  const latest = convertMessagesToModelMessages(input.messages).at(-1);
  expect(latest?.role).toBe("user");
  const content = latest?.content;
  return typeof content === "string" ? content : content?.flatMap(part => part.type === "text" ? [part.content] : []).join("") ?? "";
}

test("workspace startup failure can be retried without replacing the conversation", async ({ page }) => {
  let repaired = false;
  const starts: string[] = [];
  let changed: () => void = () => {};
  await page.routeWebSocket("**/api/authoring/changes*", socket => {
    changed = () => socket.send(JSON.stringify({ method: "workspace.changed" }));
  });
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return repaired
      ? route.fulfill({ json: { backend: "eve" } })
      : route.fulfill({ status: 503, json: { error: "Harness runtime unavailable" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    if (path.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" }, messages: [
      { id: "earlier", role: "user", parts: [{ type: "text", content: "Keep my existing course conversation" }] },
    ] } });
    if (path.endsWith("/sessions/start")) starts.push(path);
    return route.fulfill({ status: 404, json: { error: "Unexpected route" } });
  });
  await page.goto("/authoring?session=saved");
  await expect(page.getByRole("alert")).toContainText("Harness runtime unavailable");
  // The filesystem can be healthy while the agent host is unavailable. Its
  // watcher must not accidentally render the legacy ACP composer.
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/draft"));
  changed();
  await refreshed;
  await expect(page.getByTestId("authoring-chat-composer")).toHaveCount(0);
  repaired = true;
  await page.getByRole("button", { name: "Reload workspace" }).click();
  await expect(page.getByText("Keep my existing course conversation", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/session=saved/);
  expect(starts).toEqual([]);
});

test("archived history stays readable until the user explicitly starts a new conversation", async ({ page }) => {
  const writes: string[] = [];
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") writes.push(path);
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    if (path.endsWith("/sessions/archived")) return route.fulfill({ json: {
      session: { sessionId: "archived", readOnly: true }, messages: [
        { id: "old-guidance", role: "assistant", parts: [{ type: "text", content: "Preserved teaching conversation" }] },
      ],
    } });
    if (path.endsWith("/sessions/start")) return route.fulfill({ json: { sessionId: "fresh" } });
    if (path.endsWith("/sessions/fresh")) return route.fulfill({ json: { session: { sessionId: "fresh" }, messages: [] } });
    return route.fulfill({ contentType: "text/event-stream", body: "" });
  });
  await page.goto("/authoring?session=archived");
  await expect(page.getByText("Preserved teaching conversation", { exact: true })).toBeVisible();
  await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeDisabled();
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Start new conversation", exact: true }).click();
  await expect(page).toHaveURL(/session=fresh/);
  expect(writes).toEqual(["/api/authoring/eve/sessions/start"]);
});

test("a failed save stays with its file and preserves the unsaved content", async ({ page }) => {
  const files = [...draft.rootFiles, { path: "DOJO.md", label: "DOJO.md", content: "# Course guidance" }];
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: { ...draft, rootFiles: files } });
    if (path.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" }, messages: [] } });
    if (path.includes("/files/")) return route.fulfill({ status: 422, json: { error: "Fixture save rejected" } });
    return route.fulfill({ contentType: "text/event-stream", body: "" });
  });
  await page.goto("/authoring?session=saved");
  await page.getByRole("textbox", { name: "Code editor" }).focus();
  await page.keyboard.press("Meta+End");
  await page.keyboard.type("# unsaved");
  await page.keyboard.press("Meta+s");
  await expect(page.getByRole("alert").filter({ hasText: "Fixture save rejected" })).toBeVisible();
  await page.getByText("DOJO.md", { exact: true }).click();
  await expect(page.getByRole("tab", { name: "DOJO.md", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/Fixture save rejected/)).toHaveCount(0);
  await page.getByRole("tab", { name: /dojo.yaml/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Fixture save rejected" })).toBeVisible();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("# unsaved");
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.getByText(/Fixture save rejected/)).toHaveCount(0);
});

test("messages sent during a turn stay visible in the queue and are delivered once", async ({ page }) => {
  const reducer = defaultMessageReducer();
  let projection = reducer.initial();
  const requests: string[] = [];
  const release = Promise.withResolvers<void>();
  await page.route("**/api/authoring/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    if (path.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" }, messages: [] } });
    if (path.endsWith("/sessions/saved/messages")) {
      const body = route.request().postDataJSON();
      const message = await latestUserText(body);
      requests.push(message);
      if (requests.length === 1) await release.promise;
      const turn = { ...data, sequence: requests.length, turnId: `turn-${requests.length}` };
      const events: MessageStreamEvent[] = [
        { type: "message.received", data: { ...turn, message }, meta },
        { type: "message.completed", data: { ...turn, message: `Received: ${message}`, finishReason: "stop" }, meta }, wait,
      ];
      async function* source() { yield* events; }
      const response = toServerSentEventsResponse(streamEveAsAgUi({ events: source(), initial: projection, threadId: "saved", runId: body.runId }));
      const text = await response.text();
      projection = events.reduce(reducer.reduce, projection);
      return route.fulfill({ contentType: "text/event-stream", body: text });
    }
    return route.fulfill({ status: 404, json: { error: "Unexpected route" } });
  });
  await page.goto("/authoring?session=saved");
  const input = page.getByTestId("authoring-chat-composer").getByRole("textbox");
  for (const message of ["Outline arrays", "Use plain language", "Discard this request"]) {
    await input.fill(message);
    await input.press("Enter");
  }
  const queue = page.locator('[data-slot="message-queue"]');
  await expect(queue).toContainText("2 queued");
  await queue.getByRole("button", { name: 'Remove "Discard this request" from the queue' }).click();
  await expect(queue).toContainText("1 queued");
  expect(requests).toEqual(["Outline arrays"]);
  release.resolve();
  await expect(page.getByText("Received: Use plain language", { exact: true })).toBeVisible();
  await expect(queue).toHaveCount(0);
  await expect(page.getByText("Use plain language", { exact: true })).toHaveCount(1);
  expect(requests).toEqual(["Outline arrays", "Use plain language"]);
});

test("keeps a pending question while queuing messages through its continuation", async ({ page }) => {
  const reducer = defaultMessageReducer();
  let projection = opening.reduce(reducer.reduce, reducer.initial());
  const continuation = Promise.withResolvers<void>();
  const resumed = Promise.withResolvers<void>();
  const delivered: string[] = [];
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    if (path.endsWith("/sessions/saved")) return route.fulfill({ json: {
      session: { sessionId: "saved" }, messages: eveChatMessages(projection.messages),
      initialResumeSnapshot: { resumeState: { threadId: "saved", runId: "paused" }, pendingInterrupts: eveQuestionInterrupts(projection, "paused") },
    } });
    if (!path.endsWith("/sessions/saved/messages")) return route.fulfill({ status: 404 });
    const body = route.request().postDataJSON();
    let events: MessageStreamEvent[];
    if (body.resume) {
      resumed.resolve();
      await continuation.promise;
      events = [
        { type: "input.resolved", data: { ...data, resolutions: [{ kind: "question", requestId: "question-review", outcome: "answered", response: { requestId: "question-review", optionId: "review" } }] }, meta },
        { type: "message.completed", data: { ...data, sequence: 2, turnId: "resume", message: "Let's review.", finishReason: "stop" }, meta }, wait,
      ];
    } else {
      const message = await latestUserText(body);
      delivered.push(message);
      const turn = { ...data, sequence: 2 + delivered.length, turnId: `queued-${delivered.length}` };
      events = [
        { type: "message.received", data: { ...turn, message }, meta },
        { type: "message.completed", data: { ...turn, message: `Received: ${message}`, finishReason: "stop" }, meta }, wait,
      ];
    }
    async function* source() { yield* events; }
    const response = toServerSentEventsResponse(streamEveAsAgUi({ events: source(), initial: projection, threadId: "saved", runId: body.runId }));
    const text = await response.text();
    projection = events.reduce(reducer.reduce, projection);
    return route.fulfill({ contentType: "text/event-stream", body: text });
  });
  await page.goto("/authoring?session=saved");
  const input = page.getByTestId("authoring-chat-composer").getByRole("textbox");
  await input.fill("Focus on arrays");
  await input.press("Enter");
  const queue = page.locator('[data-slot="message-queue"]');
  await expect(queue).toContainText("Focus on arrays");
  await expect(page.getByRole("radio", { name: /Review the outline/ })).toBeEnabled();
  expect(delivered).toEqual([]);
  await page.getByRole("radio", { name: /Review the outline/ }).click();
  await resumed.promise;
  await expect(input).toBeEnabled();
  await input.fill("Keep it short");
  await input.press("Enter");
  await expect(queue).toContainText("Keep it short");
  continuation.resolve();
  await expect(page.getByText("Received: Keep it short", { exact: true })).toBeVisible();
  await expect(queue).toHaveCount(0);
  expect(delivered).toEqual(["Focus on arrays", "Keep it short"]);
  await expect(page.getByText(/cannot send normal input/)).toHaveCount(0);
});

test("report loading errors stay with their lesson and clear after watcher recovery", async ({ page }) => {
  let failReport = true;
  let completedReport = false;
  let changed: () => void = () => {};
  await page.routeWebSocket("**/api/authoring/changes*", socket => {
    changed = () => socket.send(JSON.stringify({ method: "workspace.changed" }));
  });
  const lessons = ["first", "second"].map(id => ({ id, title: id, senseiPath: `src/${id}/SENSEI.md`, description: "", checks: [], files: [
    { path: `src/${id}/SENSEI.md`, label: "SENSEI.md", content: `# ${id}` },
  ] }));
  await page.route("**/api/authoring/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (url.pathname.endsWith("/draft")) return route.fulfill({ json: { ...draft, lessons } });
    if (url.pathname.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" }, messages: [] } });
    if (url.pathname.endsWith("/evaluation-settings")) return route.fulfill({ json: { enabled: true } });
    if (url.pathname.endsWith("/evals")) return route.fulfill({ status: 503, json: { error: "Judge unavailable" } });
    if (url.pathname.endsWith("/report")) {
      if (failReport && url.searchParams.get("lessonId") === "first") return route.fulfill({ status: 503, json: { error: "Report temporarily unavailable" } });
      return route.fulfill({ json: { root: draft.root, report: completedReport ? {
        version: 1, directory: "/tmp/eve-course/.dojo/evaluations/run-new", lessonIds: ["first"],
        materialHash: "fixture", stage: "teaching", status: "passed",
        startedAt: "2026-10-12T00:00:00Z", completedAt: "2026-10-12T00:01:00Z",
      } : null } });
    }
    return route.fulfill({ status: 404, json: { error: "Unexpected request" } });
  });
  await page.goto("/authoring?session=saved");
  const selectLesson = async (name: string) => {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.getAttribute("aria-expanded") !== "true") await button.click();
    const item = page.locator(".ui-as-side__branch").filter({ has: button });
    await item.getByRole("button", { name: "SENSEI.md", exact: true }).click();
  };
  await selectLesson("first");
  const alert = page.getByRole("alert").filter({ hasText: "Could not load this lesson" });
  await expect(alert).toBeVisible();
  await selectLesson("second");
  await expect(alert).toHaveCount(0);
  await selectLesson("first");
  await expect(alert).toBeVisible();
  failReport = false;
  changed();
  await expect(alert).toHaveCount(0);
  await page.getByRole("button", { name: "Evaluate lesson", exact: true }).click();
  const runError = page.getByRole("alert").filter({ hasText: "Judge unavailable" });
  await expect(runError).toBeVisible();
  const reloaded = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/report"));
  changed();
  await reloaded;
  await expect(runError).toBeVisible();
  completedReport = true;
  changed();
  await expect(runError).toHaveCount(0);
  await page.getByRole("button", { name: "Evaluation results", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tested scenarios passed" })).toBeVisible();
});

test("a late evaluation cannot replace another lesson's report", async ({ page }) => {
  const release = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const lessons = ["first", "second"].map(id => ({ id, title: id, senseiPath: `src/${id}/SENSEI.md`, description: "", checks: [], files: [
    { path: `src/${id}/SENSEI.md`, label: "SENSEI.md", content: `# ${id}` },
  ] }));
  const report = (id: string) => ({ version: 1, directory: `/evidence/${id}`, lessonIds: [id], materialHash: "fixture", stage: "teaching", status: "passed", startedAt: "start", completedAt: "end" });
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (url.pathname.endsWith("/draft")) return route.fulfill({ json: { ...draft, lessons } });
    if (url.pathname.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" }, messages: [] } });
    if (url.pathname.endsWith("/evaluation-settings")) return route.fulfill({ json: { enabled: true } });
    if (url.pathname.endsWith("/report")) return route.fulfill({ json: { root: draft.root, report: report(url.searchParams.get("lessonId")!) } });
    if (url.pathname.endsWith("/evals")) {
      started.resolve();
      await release.promise;
      return route.fulfill({ json: { root: draft.root, report: report("first") } });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto("/authoring?session=saved");
  const selectLesson = async (name: string) => {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.getAttribute("aria-expanded") !== "true") await button.click();
    const item = page.locator(".ui-as-side__branch").filter({ has: button });
    await item.getByRole("button", { name: "SENSEI.md", exact: true }).click();
  };
  await selectLesson("first");
  await page.getByRole("button", { name: "Evaluate lesson", exact: true }).click();
  await started.promise;
  await selectLesson("second");
  await page.getByRole("button", { name: "Evaluation results", exact: true }).click();
  const result = page.getByRole("region", { name: "Teaching evaluation report" });
  await expect(result).toContainText("second · teaching");
  release.resolve();
  await expect(page.getByRole("button", { name: "Evaluate lesson", exact: true })).toBeEnabled();
  await expect(result).toContainText("second · teaching");
  await selectLesson("first");
  await page.getByRole("button", { name: "Evaluation results", exact: true }).click();
  await expect(result).toContainText("first · teaching");
});

test("a course without lessons has no empty report button", async ({ page }) => {
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
  await expect(page.getByRole("region", { name: "Course conversation", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Report|Evaluation results/ })).toHaveCount(0);
  expect(posts).toEqual([]);
});

test("evaluation settings save model choices, not secrets or worker paths, without starting an evaluation", async ({ page }) => {
  const writes: unknown[] = [];
  const evaluations: string[] = [];
  const catalogs: Array<{ workspace: string | null; harness: string | null }> = [];
  await page.route("**/api/authoring/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    if (path.endsWith("/models")) {
      const params = new URL(route.request().url()).searchParams;
      catalogs.push({ workspace: params.get("workspace"), harness: params.get("harness") });
      return route.fulfill({ json: params.get("harness") === "pi"
        ? [{ id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", efforts: [] }]
        : [{ id: "zai/glm-5.3", name: "GLM 5.3", efforts: [] }] });
    }
    if (path.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" }, messages: [] } });
    if (path.endsWith("/evaluation-settings")) {
      if (route.request().method() === "PUT") {
        const value = route.request().postDataJSON();
        writes.push(value);
        return route.fulfill({ json: value });
      }
      return route.fulfill({ json: null });
    }
    if (path.endsWith("/evals")) evaluations.push(path);
    return route.fulfill({ contentType: "text/event-stream", body: "" });
  });
  await page.goto("/authoring?session=saved&workspace=isolated-course");
  await page.getByRole("button", { name: "Evaluation settings", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('datalist option[value="zai/glm-5.3"]')).toHaveCount(1);
  await expect(dialog.locator('datalist option[value="deepseek/deepseek-v4-pro"]')).toHaveCount(1);
  await dialog.getByLabel("teacher model").fill("zai/glm-5.3");
  await dialog.getByLabel("learner model").fill("deepseek/deepseek-v4-pro");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Save evaluation settings" }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual([{ enabled: true, teacher: { harness: "opencode", model: "zai/glm-5.3" }, learner: { harness: "pi", model: "deepseek/deepseek-v4-pro" } }]);
  expect(evaluations).toEqual([]);
  expect(catalogs).toEqual(expect.arrayContaining([
    { workspace: "isolated-course", harness: "opencode" },
    { workspace: "isolated-course", harness: "pi" },
  ]));
});

test("evaluation settings cannot overwrite saved choices after a failed reload", async ({ page }) => {
  let broken = false;
  const writes: unknown[] = [];
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    if (path.endsWith("/models")) return route.fulfill({ status: 502, contentType: "text/plain", body: "Model catalog unavailable" });
    if (path.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" }, messages: [] } });
    if (path.endsWith("/evaluation-settings")) {
      if (route.request().method() === "PUT") writes.push(route.request().postDataJSON());
      return broken ? route.fulfill({ status: 503, contentType: "text/plain", body: "Settings storage unavailable" })
        : route.fulfill({ json: { enabled: true, teacher: { harness: "codex", model: "teacher" }, learner: { harness: "pi", model: "learner" } } });
    }
    return route.fulfill({ contentType: "text/event-stream", body: "" });
  });
  await page.goto("/authoring?session=saved");
  await page.getByRole("button", { name: "Evaluation settings", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("teacher model")).toHaveValue("teacher");
  await expect(dialog.getByText("Model catalog unavailable", { exact: true })).toHaveCount(2);
  await page.keyboard.press("Escape");
  broken = true;
  await page.getByRole("button", { name: "Evaluation settings", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Settings storage unavailable");
  await expect(dialog.getByRole("button", { name: "Save evaluation settings" })).toBeDisabled();
  await expect(dialog.getByLabel("teacher model")).toBeDisabled();
  expect(writes).toEqual([]);
});

for (const outcome of ["success", "failure"] as const) test(`a trial reserves its tab before preparation (${outcome})`, async ({ page, context }) => {
  test.setTimeout(60_000);
  const release = Promise.withResolvers<void>();
  const sessionStarts: unknown[] = [];
  await page.route("**/api/workspaces/trial-workspace/courses/trial-course/lessons/first/sessions", route => {
    expect(route.request().method()).toBe("POST");
    sessionStarts.push(route.request().postDataJSON());
    return route.fulfill({ json: {} });
  });
  await context.route("**/course/trial-workspace/trial-course/lesson/first", route => route.fulfill({ contentType: "text/html", body: "<h1>Prepared lesson</h1>" }));
  const lesson = { id: "first", title: "first", senseiPath: "src/first/SENSEI.md", description: "", checks: [], files: [{ path: "src/first/SENSEI.md", label: "SENSEI.md", content: "# First" }] };
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: { ...draft, lessons: [lesson] } });
    if (path.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" }, messages: [] } });
    if (path.endsWith("/report")) return route.fulfill({ json: { root: draft.root, report: null } });
    if (path.endsWith("/trials")) {
      await release.promise;
      return outcome === "failure"
        ? route.fulfill({ status: 503, json: { error: "Trial harness unavailable" } })
        : route.fulfill({ json: { workspaceId: "trial-workspace", courseId: "trial-course", lessonId: "first" } });
    }
    return route.fulfill({ contentType: "text/event-stream", body: "" });
  });
  await page.goto("/authoring?session=saved");
  const lessonButton = page.getByRole("button", { name: "first", exact: true });
  if (await lessonButton.getAttribute("aria-expanded") !== "true") await lessonButton.click();
  const lessonItem = page.locator(".ui-as-side__branch").filter({ has: lessonButton });
  await lessonItem.getByRole("button", { name: "SENSEI.md", exact: true }).click();
  const popup = page.waitForEvent("popup", { timeout: 5000 });
  await page.getByRole("button", { name: "Trial", exact: true }).click();
  const tab = await popup;
  expect(await tab.evaluate(() => window.opener)).toBeNull();
  release.resolve();
  if (outcome === "success") {
    await expect(tab.getByRole("heading", { name: "Prepared lesson" })).toBeVisible();
    expect(sessionStarts).toEqual([{}]);
    await expect(page).toHaveURL(/authoring\?session=saved/);
    await tab.close();
    return;
  }
  await expect.poll(() => tab.isClosed()).toBe(true);
  expect(sessionStarts).toEqual([]);
  await expect(page.getByRole("alert").filter({ hasText: "Trial harness unavailable" })).toBeVisible();
  await page.getByRole("tab", { name: "dojo.yaml", exact: true }).click();
  await expect(page.getByText(/Trial harness unavailable/)).toHaveCount(0);
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
  await expect(page.getByTestId("authoring-chat-pane").getByRole("alert")).toContainText("Session unavailable");
  await expect(page).toHaveURL(/session=missing/);
  expect(posts).toEqual([]);
});

test("a new session survives an initial history failure and an explicit retry resumes that same session", async ({ page }) => {
  let starts = 0;
  let historyReads = 0;
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    if (path.endsWith("/sessions/start")) {
      starts++;
      return route.fulfill({ status: 201, json: { sessionId: "accepted" } });
    }
    if (path.endsWith("/sessions/accepted")) {
      historyReads++;
      if (historyReads === 1) return route.fulfill({ status: 503, json: { error: "History temporarily unavailable" } });
      return route.fulfill({ json: { session: { sessionId: "accepted" }, messages: [{
        id: "intro", role: "assistant", parts: [{ type: "text", content: "We can continue the same conversation." }],
      }] } });
    }
    return route.fulfill({ status: 404, json: { error: "Unexpected route" } });
  });
  await page.goto("/authoring");
  await expect(page.getByTestId("authoring-chat-pane").getByRole("alert")).toContainText("History temporarily unavailable");
  await expect(page).toHaveURL(/session=accepted/);
  await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeDisabled();
  await page.getByRole("button", { name: "Reload conversation", exact: true }).click();
  await expect(page.getByText("We can continue the same conversation.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeEnabled();
  expect(starts).toBe(1);
  expect(historyReads).toBe(2);
  await expect(page.getByRole("button", { name: "Reload conversation", exact: true })).toHaveCount(0);
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

test("an unavailable question reports its error without leaving the selected option locked", async ({ page }) => {
  const errors: string[] = [];
  const posts: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const reducer = defaultMessageReducer();
  const projection = opening.reduce(reducer.reduce, reducer.initial());
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") posts.push(path);
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    if (path.endsWith("/sessions/saved")) return route.fulfill({ json: {
      session: { sessionId: "saved" }, messages: eveChatMessages(projection.messages),
    } });
    return route.fulfill({ status: 404, json: { error: "Unexpected route" } });
  });
  await page.goto("/authoring?session=saved");
  const review = page.getByRole("radio", { name: /Review the outline/ });
  await review.click();
  await expect(page.getByTestId("authoring-chat-pane").getByRole("alert")).toContainText("This question is no longer available");
  await expect(review).toBeEnabled();
  expect(errors).toEqual([]);
  expect(posts).toEqual([]);
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
    if (path.endsWith("/sessions/start")) {
      projection = opening.reduce(reducer.reduce, projection);
      return route.fulfill({ status: 201, json: { sessionId: "eve-1" } });
    }
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
  await expect.poll(() => calls.filter(call => call === "POST /api/authoring/eve/sessions/start").length).toBe(1);
  await expect(page.getByText("Which concept should we teach first?", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/session=eve-1/);
  expect(calls.filter(call => call === "POST /api/authoring/eve/sessions/start")).toHaveLength(1);
  await expect(page.getByText("Help me author this course.", { exact: true })).toHaveCount(0);
  if (failureCount > 0) await page.reload();
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
  expect(calls.filter(call => call === "POST /api/authoring/eve/sessions/start")).toHaveLength(1);
  expect(calls.filter(call => call === "POST /api/authoring/eve/sessions/eve-1/messages")).toHaveLength(failureCount + 1);
  expect(calls.some(call => /\/authoring\/(session|workspace|introduction|answers|messages)$/.test(call))).toBe(false);
});
}
