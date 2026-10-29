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

for (const operation of ["save", "reset", "model", "agent"] as const) test(`a delayed ${operation} response stays with its lesson after navigation`, async ({ page }) => {
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
      if (operation === "agent") return route.fulfill({ status: 201, json: { ...snapshots.first, harness: "codex", sessionId: "new-first-session", messages: [] } });
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
      await composer.getByRole("button", { name: operation === "agent" ? "Agent" : "Model", exact: true }).click();
      await page.getByRole("menuitemradio", { name: operation === "agent" ? /^Codex/ : /^GPT/ }).click();
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

for (const entry of ["course", "session"] as const) test(`native agent changes preserve drafts and a resumable address from the ${entry} view`, async ({ page }) => {
  let snapshot = { ...initialSnapshot };
  const starts: unknown[] = [];
  const modelChanges: unknown[] = [];
  const turns: string[] = [];
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [{ type: "html", html: "<h3>Goal</h3><p>Try a small example.</p><ol><li>Predict the result.</li><li>Try one change.</li></ol>" }] } });
    if (path === "/api/control/courses") return route.fulfill({ json: [{ workspaceId: "agent-workspace", dojo: "agent-course", kata: "first", mode: "katas", workspaceName: "Agents", selected: true, sessionId: snapshot.sessionId, sessions: [{ lessonId: "first", sessionId: snapshot.sessionId }] }] });
    if (path.endsWith("/sessions") && request.method() === "POST") {
      starts.push(request.postDataJSON());
      if (starts.length === 1) return route.fulfill({ status: 502, json: { error: "Codex login required" } });
      snapshot = { ...snapshot, harness: "codex", sessionId: "codex-session", model: { ...model, currentValue: "openai/model", options: [model.options[1]] }, messages: [] };
      return route.fulfill({ status: 201, json: snapshot });
    }
    if (path.endsWith("/configuration/model") && request.method() === "PUT") {
      modelChanges.push(request.postDataJSON());
      snapshot = { ...snapshot, model: { ...snapshot.model, currentValue: request.postDataJSON().value } };
      return route.fulfill({ json: snapshot.model });
    }
    if (path.endsWith("/files/solution") && request.method() === "PUT") {
      snapshot = { ...snapshot, code: request.postDataJSON().content };
      return route.fulfill({ json: { type: "lesson-files", id: "solution", attributes: { content: snapshot.code } } });
    }
    if (path.endsWith("/messages") && request.method() === "POST") turns.push(request.url());
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: snapshot });
    return route.fulfill({ status: 404, json: { error: "Unexpected request" } });
  });
  await page.goto(entry === "course" ? "/course/agent-workspace/agent-course/lesson/first" : "/session/owned");
  const composer = page.getByTestId("chat-composer");
  const agent = composer.getByRole("button", { name: "Agent", exact: true });
  await expect(agent).toContainText("OpenCode");
  const brief = page.locator(".ui-lb");
  await expect(brief.getByRole("heading", { name: "Goal", exact: true })).toBeVisible();
  const typography = await brief.evaluate(node => {
    const base = getComputedStyle(node);
    const paragraph = getComputedStyle(node.querySelector(".teaching-markdown p")!);
    const heading = getComputedStyle(node.querySelector(".teaching-markdown h3")!);
    return { family: base.fontFamily, lineHeight: base.lineHeight, paragraphFamily: paragraph.fontFamily, paragraphLineHeight: paragraph.lineHeight, headingFamily: heading.fontFamily };
  });
  expect(typography.paragraphFamily).toBe(typography.family);
  expect(typography.paragraphLineHeight).toBe(typography.lineHeight);
  expect(typography.headingFamily).toBe(typography.family);
  const draft = composer.getByRole("textbox");
  await draft.fill("Keep my question");
  const editor = page.getByRole("textbox", { name: "Code editor", exact: true });
  await editor.press("ControlOrMeta+End");
  await editor.pressSequentially("// Keep my code");
  await composer.getByRole("button", { name: "Model", exact: true }).click();
  await page.getByRole("menuitemradio", { name: /^GPT/ }).click();
  await expect.poll(() => modelChanges).toEqual([{ value: "openai/model" }]);
  await expect(page.getByTestId("chat-pane")).toContainText("Original conversation");
  const selectCodex = async () => {
    await agent.click();
    await expect(page.getByRole("menuitemradio", { name: /^Pi/ })).toHaveCount(0);
    await page.getByRole("menuitemradio", { name: /^Codex/ }).click();
  };
  await selectCodex();
  await expect(page.getByRole("alert").filter({ hasText: "Codex login required" })).toBeVisible();
  await expect(agent).toContainText("OpenCode");
  await expect(page.getByTestId("chat-pane")).toContainText("Original conversation");
  await selectCodex();
  await expect(agent).toContainText("Codex");
  await expect(page).toHaveURL(/\/session\/codex-session$/, { timeout: 5000 });
  await expect(draft).toHaveValue("Keep my question");
  await expect(page.locator(".monaco-editor[data-uri] .view-lines")).toContainText("// Keep my code");
  expect(starts).toEqual([{ harness: "codex" }, { harness: "codex" }]);
  expect(turns).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("native-agent-picker.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  const tabs = page.getByRole("tablist", { name: "Lesson workspace", exact: true });
  await expect(tabs.getByRole("tab", { name: /^first\.ts/ })).toBeInViewport({ ratio: 1 });
  await expect(tabs.getByRole("tab", { name: /Tests/ })).toBeInViewport({ ratio: 1 });
  for (const name of ["Reset", "Undo", "Save", "Check"]) await expect(page.getByRole("button", { name, exact: true })).toBeInViewport({ ratio: 1 });
  await tabs.getByRole("tab", { name: /Tests/ }).click();
  await expect(page.getByRole("tabpanel").filter({ visible: true })).toContainText(/No tests|Run|check/i);
  await tabs.getByRole("tab", { name: /^first\.ts/ }).click();
  await expect(page.locator(".view-lines")).toContainText("// Keep my code");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const resetButton = page.getByRole("button", { name: "Reset", exact: true });
  await resetButton.click();
  const resetDialog = page.getByRole("dialog", { name: "Reset this lesson?", exact: true });
  await expect(resetDialog).toBeVisible();
  await expect(resetDialog.getByRole("button", { name: "Cancel", exact: true })).toHaveClass(/ui-button/);
  await expect(resetDialog.getByRole("button", { name: "Reset lesson", exact: true })).toHaveClass(/ui-button/);
  const surface = await resetDialog.evaluate(node => {
    const style = getComputedStyle(node);
    const probe = document.createElement("div");
    probe.style.background = "var(--surface-5)";
    probe.style.borderRadius = "var(--box-radius)";
    node.append(probe);
    const expected = getComputedStyle(probe);
    const result = { background: style.backgroundColor, radius: style.borderRadius, expectedBackground: expected.backgroundColor, expectedRadius: expected.borderRadius };
    probe.remove();
    return result;
  });
  expect(surface.background).toBe(surface.expectedBackground);
  expect(surface.radius).toBe(surface.expectedRadius);
  expect(surface.radius).not.toBe("0px");
  await page.screenshot({ path: test.info().outputPath("learner-reset-phone.png"), animations: "disabled" });
  await resetDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(resetDialog).not.toBeVisible();
  await expect(resetButton).toBeFocused();
  await expect(page.locator(".view-lines")).toContainText("// Keep my code");
  expect(starts).toHaveLength(2);
  expect(turns).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("native-learner-phone.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  const sessionUrl = page.url();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sessionUrl);
  await expect(agent).toContainText("Codex");
  await expect(page.locator(".view-lines")).toContainText("// Keep my code");
  await draft.fill("Resume without restarting");
  expect(turns).toEqual([]);
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
