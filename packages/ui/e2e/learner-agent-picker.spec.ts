import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

const model = { id: "model", name: "Model", currentValue: "deepseek/model", options: [
    { value: "deepseek/model", name: "DeepSeek", group: "DeepSeek" },
    { value: "openai/model", name: "GPT", group: "OpenAI" },
  ] };
const initialSnapshot = { dojo: "agent-course", kata: "first", title: "First lesson", briefing: "# First lesson\nTry a small example.",
    code: "export const answer = 0;\n", starterCode: "export const answer = 0;\n", fileId: "solution", filePath: "first.ts", language: "typescript",
    introduced: true, checkpointed: false, sessionId: "owned", harness: "opencode", harnesses: ["opencode", "codex"], model,
    state: "ongoing", isCurrent: true, result: null, fragments: {},
    messages: [{ id: "old", role: "assistant", parts: [{ type: "text", content: "Original conversation" }] }],
    lessons: [{ name: "first", title: "First lesson", summary: "Try it", state: "ongoing", isCurrent: true }] };

for (const operation of ["save", "reset", "model"] as const) test(`a delayed ${operation} response stays with its lesson after navigation`, async ({ page }) => {
  const reply = Promise.withResolvers<void>();
  const snapshots = {
    first: { ...initialSnapshot, lessons: [...initialSnapshot.lessons, { name: "second", title: "Second lesson", summary: "Review another example", state: "completed", isCurrent: false }] },
    second: { ...initialSnapshot, kata: "second", title: "Second lesson", filePath: "second.ts", code: "export const second = 2;\n", starterCode: "export const second = 0;\n", sessionId: "second-session", messages: [] },
  };
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/control/courses") return route.fulfill({ json: [] });
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/diagnostics")) return route.fulfill({ json: [] });
    if (path.endsWith("/completions")) return route.fulfill({ json: { from: 0, options: [] } });
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: snapshots.first });
    if (path.endsWith("/lessons/second")) return route.fulfill({ json: snapshots.second });
    if (path.includes("/lessons/first/") && ["PUT", "POST"].includes(request.method())) {
      await reply.promise;
      if (operation === "model") return route.fulfill({ json: { ...model, currentValue: "openai/model" } });
      return route.fulfill({ json: { type: "lesson-files", id: "solution", attributes: { content: request.postDataJSON().content } } });
    }
    return route.fulfill({ status: 404 });
  });
  try {
    await page.goto("/course/agent-workspace/agent-course/lesson/first");
    const composer = page.getByTestId("chat-composer");
    await composer.getByRole("textbox").fill("First lesson question");
    const requested = page.waitForRequest(request => ["PUT", "POST"].includes(request.method()) && new URL(request.url()).pathname.includes("/lessons/first/"));
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
    await page.getByRole("link", { name: /Second lesson/ }).click();
    await expect(page.locator(".view-lines")).toContainText("export const second = 2;");
    const question = composer.getByRole("textbox");
    await question.fill("Second lesson question");
    reply.resolve();
    await request.response();
    await composer.getByRole("button", { name: "Model", exact: true }).click();
    await expect(page.getByRole("menuitemradio", { name: /^DeepSeek/ })).toBeChecked({ timeout: 5000 });
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/lesson\/second$/, { timeout: 5000 });
    await expect(page.locator(".view-lines")).toContainText("export const second = 2;");
    await expect(question).toHaveValue("Second lesson question");
    await expect(composer.getByRole("button", { name: "Agent", exact: true })).toContainText("OpenCode");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled({ timeout: 5000 });
  } finally { reply.resolve(); }
});

test("an introduced session with no visible messages resumes without another introduction", async ({ page }) => {
  const turns: string[] = [];
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/control/courses") return route.fulfill({ json: [{ workspaceId: "agent-workspace", dojo: "agent-course", kata: "first", mode: "katas", workspaceName: "Agents", selected: true,
      sessionId: "owned", sessions: [{ lessonId: "first", sessionId: "owned" }] }] });
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: { ...initialSnapshot, messages: [] } });
    if (path.endsWith("/messages") && request.method() === "POST") turns.push(path);
    return route.fulfill({ status: 404, json: { error: "Unexpected automatic turn" } });
  });
  await page.goto("/session/owned");
  const composer = page.getByTestId("chat-composer");
  await composer.getByRole("textbox").fill("Pick up where we left off");
  await composer.getByRole("button", { name: "Model", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: /^DeepSeek/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(composer.getByRole("textbox")).toHaveValue("Pick up where we left off");
  expect(turns).toEqual([]);
});

for (const operation of ["save", "reset"] as const) test(`a delayed file-${operation} response cannot revert a newer model selection`, async ({ page }) => {
  const save = Promise.withResolvers<void>();
  const modelReply = Promise.withResolvers<void>();
  if (operation === "save") modelReply.resolve();
  let snapshot = { ...initialSnapshot };
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/control/courses") return route.fulfill({ json: [] });
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/diagnostics")) return route.fulfill({ json: [] });
    if (path.endsWith("/completions")) return route.fulfill({ json: { from: 0, options: [] } });
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: snapshot });
    if (path.endsWith("/files/solution") && request.method() === "PUT") {
      await save.promise;
      snapshot = { ...snapshot, code: request.postDataJSON().content };
      return route.fulfill({ json: { type: "lesson-files", id: "solution", attributes: { content: snapshot.code } } });
    }
    if (path.endsWith("/configuration/model") && request.method() === "PUT") {
      snapshot = { ...snapshot, model: { ...snapshot.model, currentValue: request.postDataJSON().value } };
      await modelReply.promise;
      return route.fulfill({ json: snapshot.model });
    }
    return route.fulfill({ status: 404 });
  });
  try {
    await page.goto("/course/agent-workspace/agent-course/lesson/first");
    const editor = page.getByRole("textbox", { name: "Code editor", exact: true });
    await editor.press("ControlOrMeta+End");
    await page.keyboard.insertText("\n// Save while choosing a model\n");
    const requested = page.waitForRequest(request => request.method() === "PUT" && new URL(request.url()).pathname.endsWith("/files/solution"));
    const saveButton = page.getByRole("button", { name: "Save", exact: true });
    if (operation === "save") { await saveButton.click(); await requested; }
    const modelButton = page.getByRole("button", { name: "Model", exact: true, includeHidden: true });
    const modelResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/configuration/model"));
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
