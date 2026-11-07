import type { Page, Route, WebSocketRoute } from "@playwright/test";
import type { startEve } from "@dojofoo/harness/api/fixtures";
import { expect, startConversation, test, type MountedAgentChat } from "./agent-chat.fixture";

test.setTimeout(90_000);

const learner = "agent-workspace";
const lessons = [{ name: "first", title: "First lesson", summary: "Try it", state: "ongoing", isCurrent: true },
  { name: "second", title: "Second lesson", summary: "Review another example", state: "completed", isCurrent: false }];
const initialSnapshot = { dojo: "agent-course", kata: "first", title: "First lesson", briefing: "# First lesson\nTry a small example.",
  code: "export const answer = 0;\n", starterCode: "export const answer = 0;\n", fileId: "solution", filePath: "first.ts", language: "typescript",
  introduced: true, checkpointed: false, state: "ongoing", isCurrent: true, result: null, fragments: {}, lessons };
const snapshots = {
  first: initialSnapshot,
  second: { ...initialSnapshot, kata: "second", title: "Second lesson", filePath: "second.ts", code: "export const second = 2;\n", starterCode: "export const second = 0;\n",
    // Open from the first lesson's navigation as a done lesson, and editable, so its Save shows
    state: "completed", isCurrent: true },
};
const models = { data: [{ id: "deepseek/model", name: "DeepSeek", efforts: [] }, { id: "openai/model", name: "GPT", efforts: [] }], pagination: { hasMore: false } };

/** The fixture runtime's Sensei conversations for both lessons, on DeepSeek; the page's other routes, registered after the fixture's */
async function lessonPage(page: Page, eve: Awaited<ReturnType<typeof startEve>>, mountAgentChat: (page: Page, options?: object) => Promise<MountedAgentChat>,
  hold?: (route: Route) => Promise<unknown> | undefined) {
  const mounted = await mountAgentChat(page, { persona: "sensei", workspaceId: learner, files: false, existingSession: false });
  const conversations: Record<string, string> = {};
  for (const lesson of ["first", "second"]) {
    const record = await startConversation(eve, mounted.runtime, `Hello from ${lesson}`);
    Object.assign(record, { persona: "sensei", courseId: "agent-course", lessonId: lesson, model: "deepseek/model" });
    conversations[lesson] = record.id;
  }
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (/^\/api\/v1\/workspaces\/[^/]+\/agents\/[^/]+\/models$/u.test(path)) return route.fulfill({ json: models });
    if (path.startsWith("/api/v1/") || path === "/api/control/launch-token" || path === "/api/local/setup") {
      const held = hold?.(route);
      if (held) { await held; return; }
      return route.fallback();
    }
    if (path === "/api/control/courses") return route.fulfill({ json: [{ workspaceId: learner, runId: "learn-run", dojo: "agent-course", title: "Agent course", kata: "first", mode: "katas",
      workspaceName: "Learning", selected: true, sessions: [] }] });
    if (path === "/api/control/learning-sessions/learn-run") return route.fulfill({ json: { id: "agent-course", title: "Agent course", workspaceId: learner, runId: "learn-run",
      mode: "katas", kata: "first", description: "", version: "1.0.0", language: "TypeScript", tags: [], lessons: ["first", "second"] } });
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/diagnostics")) return route.fulfill({ json: [] });
    if (path.endsWith("/completions")) return route.fulfill({ json: { from: 0, options: [] } });
    const held = hold?.(route);
    if (held) { await held; return; }
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: snapshots.first });
    if (path.endsWith("/lessons/second")) return route.fulfill({ json: snapshots.second });
    return route.fulfill({ status: 404, json: { error: "Not in this spec" } });
  });
  return { ...mounted, conversations };
}

for (const operation of ["save", "reset", "model"] as const) test(`a delayed ${operation} response stays with its lesson after navigation`, async ({ page, mountAgentChat, eve }) => {
  const reply = Promise.withResolvers<void>();
  let first = "";
  const held = (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (operation !== "model" && request.method() === "PUT" && path.includes("/lessons/first/files/")) {
      return reply.promise.then(() => route.fulfill({ json: { type: "lesson-files", id: "solution", attributes: { content: request.postDataJSON().content } } }));
    }
    if (operation === "model" && request.method() === "PATCH" && path.endsWith(`/sessions/${first}`)) return reply.promise.then(() => route.fallback());
    return undefined;
  };
  const { conversations } = await lessonPage(page, eve, mountAgentChat, held);
  first = conversations.first!;
  try {
    await page.goto("/learn/learn-run");
    const composer = page.getByTestId("authoring-chat-composer");
    await expect(page.getByText("Echo: Hello from first", { exact: true })).toBeVisible({ timeout: 15_000 });
    await composer.getByRole("textbox").fill("First lesson question");
    const requested = page.waitForRequest(request => (request.method() === "PUT" && new URL(request.url()).pathname.includes("/lessons/first/"))
      || (request.method() === "PATCH" && new URL(request.url()).pathname.endsWith(`/sessions/${first}`)));
    if (operation === "save" || operation === "reset") {
      const editor = page.getByRole("textbox", { name: "Code editor", exact: true });
      await editor.press("ControlOrMeta+End");
      await page.keyboard.insertText("// First lesson edit");
      if (operation === "save") await page.getByRole("button", { name: "Save", exact: true }).click();
      else {
        await page.getByRole("button", { name: "Reset", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Reset this lesson?", exact: true });
        await dialog.getByRole("button", { name: "Reset lesson", exact: true }).click();
        await requested;
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      }
    } else {
      await composer.getByRole("button", { name: "Model", exact: true }).click();
      await page.getByRole("menuitemradio", { name: /^GPT/ }).click();
    }
    const request = await requested;
    await page.getByRole("button", { name: /^Second lesson \(done\)/u }).click();
    await expect(page.locator(".view-lines")).toContainText("export const second = 2;");
    await expect(page.getByText("Echo: Hello from second", { exact: true })).toBeVisible({ timeout: 15_000 });
    const question = page.getByTestId("authoring-chat-composer").getByRole("textbox");
    await question.fill("Second lesson question");
    reply.resolve();
    await request.response();
    const secondComposer = page.getByTestId("authoring-chat-composer");
    await secondComposer.getByRole("button", { name: "Model", exact: true }).click();
    await expect(page.getByRole("menuitemradio", { name: /^DeepSeek/ })).toBeChecked({ timeout: 5000 });
    await page.keyboard.press("Escape");
    // The page's address names the course run, not the lesson (step 4, decision 42): the lesson shows in its material
    await expect(page.getByTestId("lesson-pane")).toContainText("Second lesson");
    await expect(page.locator(".view-lines")).toContainText("export const second = 2;");
    await expect(question).toHaveValue("Second lesson question");
    await expect(secondComposer.getByRole("button", { name: "Agent", exact: true })).toContainText("Codex");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled({ timeout: 5000 });
  } finally { reply.resolve(); }
});

test("a reopened conversation sends no automatic turn", async ({ page, mountAgentChat, eve }) => {
  const { sent } = await lessonPage(page, eve, mountAgentChat);
  await page.goto("/learn/learn-run");
  const composer = page.getByTestId("authoring-chat-composer");
  await expect(page.getByText("Echo: Hello from first", { exact: true })).toBeVisible({ timeout: 15_000 });
  await composer.getByRole("textbox").fill("Pick up where we left off");
  await composer.getByRole("button", { name: "Model", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: /^DeepSeek/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(composer.getByRole("textbox")).toHaveValue("Pick up where we left off");
  expect(sent).toEqual([]);
});

for (const operation of ["save", "reset"] as const) test(`a delayed file-${operation} response cannot revert a newer model selection`, async ({ page, mountAgentChat, eve }) => {
  const save = Promise.withResolvers<void>();
  const modelReply = Promise.withResolvers<void>();
  if (operation === "save") modelReply.resolve();
  let first = "";
  let code = initialSnapshot.code;
  const held = (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "PUT" && path.endsWith("/files/solution")) {
      return save.promise.then(() => {
        code = request.postDataJSON().content;
        return route.fulfill({ json: { type: "lesson-files", id: "solution", attributes: { content: code } } });
      });
    }
    if (request.method() === "PATCH" && path.endsWith(`/sessions/${first}`)) return modelReply.promise.then(() => route.fallback());
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: { ...snapshots.first, code } });
    return undefined;
  };
  const { conversations } = await lessonPage(page, eve, mountAgentChat, held);
  first = conversations.first!;
  try {
    await page.goto("/learn/learn-run");
    await expect(page.getByText("Echo: Hello from first", { exact: true })).toBeVisible({ timeout: 15_000 });
    const editor = page.getByRole("textbox", { name: "Code editor", exact: true });
    await editor.press("ControlOrMeta+End");
    await page.keyboard.insertText("\n// Save while choosing a model\n");
    const requested = page.waitForRequest(request => request.method() === "PUT" && new URL(request.url()).pathname.endsWith("/files/solution"));
    const saveButton = page.getByRole("button", { name: "Save", exact: true });
    if (operation === "save") { await saveButton.click(); await requested; }
    const modelButton = page.getByTestId("authoring-chat-composer").getByRole("button", { name: "Model", exact: true, includeHidden: true });
    const modelResponse = page.waitForResponse(response => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith(`/sessions/${first}`));
    await modelButton.click();
    await page.getByRole("menuitemradio", { name: /^GPT/ }).click();
    if (operation === "reset") {
      await page.getByRole("button", { name: "Reset", exact: true }).click();
      await page.getByRole("dialog", { name: "Reset this lesson?", exact: true }).getByRole("button", { name: "Reset lesson", exact: true }).click();
      await requested;
      modelReply.resolve();
    }
    await modelResponse;
    await expect(modelButton).toContainText("GPT");
    save.resolve();
    await expect(saveButton).toBeDisabled();
    await expect(modelButton).toContainText("GPT", { timeout: 5000 });
    if (operation === "save") await expect(page.locator(".view-lines")).toContainText("Save while choosing a model");
    else await expect(page.locator(".view-lines")).not.toContainText("Save while choosing a model");
  } finally { save.resolve(); modelReply.resolve(); }
});

/** The lesson file's writes succeed, as the server answers them */
const savedFile = (route: Route) => {
  const request = route.request();
  if (request.method() !== "PUT" || !new URL(request.url()).pathname.endsWith("/files/solution")) return undefined;
  return route.fulfill({ json: { type: "lesson-files", id: "solution", attributes: { content: request.postDataJSON().content } } });
};

test("only the learner's own Check becomes a card, whatever check overlaps it, fails or loses its socket", async ({ page, mountAgentChat, eve }) => {
  await lessonPage(page, eve, mountAgentChat, savedFile);
  // The lesson socket, answered here: the ids of the page's checks, and the notifications the server would send
  const checks: string[] = [];
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket("**/api/session*", ws => {
    socket = ws;
    ws.onMessage(message => {
      const request = JSON.parse(String(message)) as { id: string; method: string };
      if (request.method === "lesson.check") checks.push(request.id);
    });
  });
  const notify = (method: string, params: object) => socket!.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  const started = (checkId?: string) => notify("lesson.check.started", { courseId: "agent-course", lessonId: "first", ...(checkId ? { checkId } : {}) });
  const completed = (id: string, passed: number, total: number, checkId?: string) => notify("lesson.check.completed", { lesson: snapshots.first,
    observation: { id, attempt: 1, codeChanged: true, diff: "", report: { passed, failed: total - passed, skipped: 0, total, complete: false, tests: [] } },
    ...(checkId ? { checkId } : {}) });
  await page.goto("/learn/learn-run");
  await expect(page.getByText("Echo: Hello from first", { exact: true })).toBeVisible({ timeout: 15_000 });
  const chat = page.getByTestId("chat-pane");
  const check = page.getByRole("button", { name: "Check", exact: true });
  const running = page.getByText("Running lesson checks…", { exact: true });
  // The Tests tab's state names the lesson's latest result, whoever ran the check
  const latest = (passed: number, total: number) => page.getByRole("img", { name: `${passed} of ${total} tests passed`, exact: true });

  // Sensei's check overlaps the learner's: only the learner's becomes a card, and Check waits for it
  await check.click();
  await expect.poll(() => checks.length).toBe(1);
  await expect(check).toBeDisabled();
  started();
  started(checks[0]);
  completed("sensei-1", 2, 3);
  await expect(latest(2, 3)).toBeVisible();
  await expect(running).toBeVisible();
  await expect(check).toBeDisabled();
  await expect(chat).toHaveAttribute("data-host-event-count", "0");
  completed("learner-1", 1, 3, checks[0]);
  await expect(latest(1, 3)).toBeVisible();
  await expect(chat).toHaveAttribute("data-host-event-count", "1");
  await expect(running).toHaveCount(0);
  await expect(check).toBeEnabled();

  // A failed Check ends with its error and leaves nothing behind: Sensei's next check is still no card
  await check.click();
  await expect.poll(() => checks.length).toBe(2);
  socket!.send(JSON.stringify({ jsonrpc: "2.0", id: checks[1], error: { code: -32_000, message: "The lesson checks could not run" } }));
  await expect(page.getByRole("alert").filter({ hasText: "The lesson checks could not run" })).toBeVisible();
  await expect(running).toHaveCount(0);
  await expect(check).toBeEnabled();
  started();
  completed("sensei-2", 0, 2);
  await expect(latest(0, 2)).toBeVisible();
  await expect(chat).toHaveAttribute("data-host-event-count", "1");

  // A Check whose socket drops stops running, says so, and can be pressed again
  await check.click();
  await expect.poll(() => checks.length).toBe(3);
  await expect(running).toBeVisible();
  await socket!.close();
  await expect(page.getByRole("alert").filter({ hasText: "The lesson connection closed before the check finished." })).toBeVisible();
  await expect(running).toHaveCount(0);
  await expect(check).toBeEnabled();
  await expect(chat).toHaveAttribute("data-host-event-count", "1");
});

test("leaving a lesson with unsaved code asks first, whether the learner or Sensei moves on", async ({ page, mountAgentChat, eve }) => {
  await lessonPage(page, eve, mountAgentChat, savedFile);
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket("**/api/session*", ws => { socket = ws; });
  await page.goto("/learn/learn-run");
  const lines = page.locator(".view-lines");
  await expect(lines).toContainText("export const answer = 0;");
  const editor = page.getByRole("textbox", { name: "Code editor", exact: true });
  const leave = page.getByRole("dialog", { name: "Leave this lesson?", exact: true });
  await editor.press("ControlOrMeta+End");
  await page.keyboard.insertText("// Not saved yet");
  // The sidebar's lesson and the Dashboard crumb ask first; Cancel keeps the lesson and its code
  await page.getByRole("button", { name: /^Second lesson \(done\)/u }).click();
  await expect(leave).toContainText("Your unsaved changes to first.ts will be discarded.");
  await leave.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(leave).toBeHidden();
  await page.getByRole("navigation", { name: "Breadcrumb", exact: true }).getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(leave).toBeHidden();
  await expect(page).toHaveURL(/\/learn\/learn-run$/u);
  await expect(lines).toContainText("// Not saved yet");
  // Sensei's Move on asks the same question; leaving opens the next lesson
  await expect.poll(() => socket).toBeDefined();
  socket!.send(JSON.stringify({ jsonrpc: "2.0", method: "lesson.navigated", params: { courseId: "agent-course", lessonId: "second" } }));
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "Leave lesson", exact: true }).click();
  await expect(page).toHaveURL(/\/learn\/learn-run\/second$/u);
  await expect(lines).toContainText("export const second = 2;");
  // Saved code leaves without a question
  await editor.press("ControlOrMeta+End");
  await page.keyboard.insertText("// Saved before leaving");
  const save = page.getByRole("button", { name: "Save", exact: true });
  await save.click();
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: /^First lesson \(in progress\)/u }).click();
  await expect(page).toHaveURL(/\/learn\/learn-run\/first$/u);
  await expect(lines).toContainText("export const answer = 0;");
  await expect(leave).toHaveCount(0);
});

test("another conversation of the same lesson keeps the learner's unsaved code without asking", async ({ page, mountAgentChat, eve }) => {
  const { runtime } = await lessonPage(page, eve, mountAgentChat);
  const earlier = await startConversation(eve, runtime, "An earlier talk about first");
  Object.assign(earlier, { persona: "sensei", courseId: "agent-course", lessonId: "first", model: "deepseek/model", firstMessage: "An earlier talk about first" });
  await page.goto("/learn/learn-run");
  const lines = page.locator(".view-lines");
  await expect(lines).toContainText("export const answer = 0;");
  await expect(page.getByText("Echo: Hello from first", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("textbox", { name: "Code editor", exact: true }).press("ControlOrMeta+End");
  await page.keyboard.insertText("// Not saved yet");
  await page.getByRole("button", { name: "Conversations", exact: true }).click();
  await page.getByRole("list", { name: "Conversations", exact: true }).getByRole("listitem").filter({ hasText: "An earlier talk about first" }).getByRole("button").click();
  await expect(page).toHaveURL(new RegExp(`session=${earlier.id}$`, "u"));
  await expect(page.getByText("Echo: An earlier talk about first", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("dialog", { name: "Leave this lesson?", exact: true })).toHaveCount(0);
  await expect(lines).toContainText("// Not saved yet");
});

test("closing the tab with unsaved lesson code gets the browser's prompt", async ({ page, mountAgentChat, eve }) => {
  await lessonPage(page, eve, mountAgentChat);
  await page.goto("/learn/learn-run");
  await expect(page.locator(".view-lines")).toContainText("export const answer = 0;");
  await page.getByRole("textbox", { name: "Code editor", exact: true }).press("ControlOrMeta+End");
  await page.keyboard.insertText("// Not saved yet");
  const prompt = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const dialog = await prompt;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.accept();
});

test("a refetch of the open lesson takes its newer snapshot and keeps the learner's unsaved code", async ({ page, mountAgentChat, eve }) => {
  const refetch = Promise.withResolvers<void>();
  let held = false;
  // A check ran since the page cached the first lesson
  const newer = { ...snapshots.first, result: { passed: 0, failed: 1, skipped: 0, total: 1, complete: false, tests: [] } };
  await lessonPage(page, eve, mountAgentChat, route => {
    const request = route.request();
    if (!held || request.method() !== "GET" || !new URL(request.url()).pathname.endsWith("/lessons/first")) return undefined;
    return refetch.promise.then(() => route.fulfill({ json: newer }));
  });
  try {
    const lines = page.locator(".view-lines");
    await page.goto("/learn/learn-run");
    await expect(lines).toContainText("export const answer = 0;");
    await page.getByRole("button", { name: /^Second lesson \(done\)/u }).click();
    await expect(lines).toContainText("export const second = 2;");
    // Back on the first lesson, its cached snapshot opens at once and the refetch behind it waits
    held = true;
    await page.getByRole("button", { name: /^First lesson \(in progress\)/u }).click();
    await expect(lines).toContainText("export const answer = 0;");
    await page.getByRole("textbox", { name: "Code editor", exact: true }).press("ControlOrMeta+End");
    await page.keyboard.insertText("// Typed before the refetch");
    refetch.resolve();
    await expect(page.getByRole("img", { name: "0 of 1 tests passed", exact: true })).toBeVisible();
    await expect(lines).toContainText("// Typed before the refetch");
  } finally { refetch.resolve(); }
});
