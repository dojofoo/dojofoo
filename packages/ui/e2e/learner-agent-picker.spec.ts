import { expect, test } from "@playwright/test";

test("native agent changes use the session boundary and preserve drafts on failure and success", async ({ page }) => {
  const model = { id: "model", name: "Model", currentValue: "deepseek/model", options: [
    { value: "deepseek/model", name: "DeepSeek", group: "DeepSeek" },
    { value: "openai/model", name: "GPT", group: "OpenAI" },
  ] };
  let snapshot = { dojo: "agent-course", kata: "first", title: "First lesson", briefing: "# First lesson\nTry a small example.",
    code: "export const answer = 0;\n", starterCode: "export const answer = 0;\n", fileId: "solution", filePath: "first.ts", language: "typescript",
    introduced: true, checkpointed: false, sessionId: "owned", harness: "opencode", harnesses: ["opencode", "codex"], model,
    state: "ongoing", isCurrent: true, result: null, fragments: {},
    messages: [{ id: "old", role: "assistant", parts: [{ type: "text", content: "Original conversation" }] }],
    lessons: [{ name: "first", title: "First lesson", summary: "Try it", state: "ongoing", isCurrent: true }] };
  const starts: unknown[] = [];
  const modelChanges: unknown[] = [];
  const turns: string[] = [];
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [{ type: "html", html: "<p>Try a small example.</p>" }] } });
    if (path === "/api/control/courses") return route.fulfill({ json: [{ workspaceId: "agent-workspace", dojo: "agent-course", kata: "first", mode: "katas", workspaceName: "Agents", selected: true, sessionId: "owned", sessions: [{ lessonId: "first", sessionId: "owned" }] }] });
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
    if (path.endsWith("/messages") && request.method() === "POST") turns.push(request.url());
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: snapshot });
    return route.fulfill({ status: 404, json: { error: "Unexpected request" } });
  });
  await page.goto("/course/agent-workspace/agent-course/lesson/first");
  const composer = page.getByTestId("chat-composer");
  const agent = composer.getByRole("button", { name: "Agent", exact: true });
  await expect(agent).toContainText("OpenCode");
  const draft = composer.getByRole("textbox");
  await draft.fill("Keep my question");
  const editor = page.getByRole("textbox", { name: "Code editor", exact: true });
  await editor.press("ControlOrMeta+End");
  await editor.pressSequentially("// Keep my code");
  const editorNode = await page.locator(".monaco-editor[data-uri]").elementHandle();
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
  await expect(draft).toHaveValue("Keep my question");
  await expect(page.locator(".monaco-editor[data-uri] .view-lines")).toContainText("// Keep my code");
  expect(await page.locator(".monaco-editor[data-uri]").evaluate((node, first) => node === first, editorNode)).toBe(true);
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
  expect(await page.locator(".monaco-editor[data-uri]").evaluate((node, first) => node === first, editorNode)).toBe(true);
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
});
