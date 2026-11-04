import type { Page, Route } from "@playwright/test";
import type { startEve } from "@dojofoo/agent-api/fixtures";
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
