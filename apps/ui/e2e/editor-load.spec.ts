import { expect, test } from "@playwright/test";

test("loads the local CodeMirror editor", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".cm-editor")).toBeVisible();
  const editor = page.getByRole("textbox", { name: "Solution code" });
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n// editable in the dojo");
  await expect(editor).toContainText("editable in the dojo");
});

test("undoes editor changes from the toolbar and keyboard", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Solution code" });
  await expect(editor).toBeVisible();
  const original = await page.locator(".cm-content .cm-line").allTextContents().then((lines) => lines.join("\n"));

  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n// undo from toolbar");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => page.locator(".cm-content .cm-line").allTextContents().then((lines) => lines.join("\n"))).toBe(original);

  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n// undo from keyboard");
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => page.locator(".cm-content .cm-line").allTextContents().then((lines) => lines.join("\n"))).toBe(original);
});

test("resets the current lesson to its original scaffold", async ({ page }) => {
  await page.goto("/");
  const snapshot = await page.evaluate(() => fetch("/api/lesson").then((response) => response.json()));
  const scaffold = `${snapshot.code.split("\n")[0]}\n\n// original kata scaffold\n`;
  let resetCalled = false;
  await page.route("**/api/lesson/reset", (route) => {
    resetCalled = true;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ...snapshot, code: scaffold, result: null }),
    });
  });

  await page.getByRole("button", { name: "Reset" }).click();
  const dialog = page.getByRole("dialog", { name: "Reset this lesson?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Your current solution will be discarded.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(resetCalled).toBe(false);

  await page.getByRole("button", { name: "Reset" }).click();
  await dialog.getByRole("button", { name: "Reset lesson" }).click();
  await expect.poll(() => page.locator(".cm-content .cm-line").allTextContents().then((lines) => lines.join("\n").trim())).toBe(scaffold.trim());
  expect(resetCalled).toBe(true);
});

test("isolates editor documents while switching between lessons", async ({ page }) => {
  await page.goto("/");
  const current = await page.evaluate(() => fetch("/api/lesson").then((response) => response.json()));
  const previous = current.lessons.find((lesson: { state: string }) => lesson.state === "completed");
  expect(previous).toBeTruthy();
  const previousSnapshot = await page.evaluate(
    (kata) => fetch(`/api/lesson/${encodeURIComponent(kata)}`).then((response) => response.json()),
    previous.name,
  );
  const editor = page.getByRole("textbox", { name: "Solution code" });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n// unsaved current lesson edit");
  await expect(editor).toContainText("unsaved current lesson edit");

  let previousRequests = 0;
  await page.route(`**/api/lesson/${previous.name}`, async (route) => {
    previousRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, previousRequests === 1 ? 50 : 1500));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(previousSnapshot) });
  });
  await page.route(`**/api/lesson/${current.kata}`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(current) })
  );

  await page.getByRole("button", { name: new RegExp(previous.title, "i") }).click();
  await page.locator('[data-lesson-state="completed"]')
    .filter({ hasText: previous.title })
    .getByRole("button", { name: "Open lesson" })
    .click();
  const editorText = () => page.locator(".cm-content .cm-line").allTextContents().then((lines) => lines.join("\n").trim());
  await expect.poll(editorText).toBe(previousSnapshot.code.trim());

  await page.getByRole("button", { name: new RegExp(current.title, "i") }).click();
  await expect.poll(editorText).toBe(current.code.trim());
  await page.waitForTimeout(1700);
  expect(previousRequests).toBe(2);
  expect(await editorText()).toBe(current.code.trim());
});

test("keeps a 16:9 editor viewport and scrolls as the solution grows", async ({ page }) => {
  await page.goto("/");
  const frame = page.getByTitle(/CodeMirror editor:/);
  const editor = page.locator(".cm-editor");
  const scroller = page.locator(".cm-scroller");
  await editor.waitFor();

  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1);

  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText(`\n${Array.from({ length: 80 }, (_, index) => `// extra line ${index + 1}`).join("\n")}`);
  const overflow = await scroller.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);
  expect(overflow.scrollTop).toBeGreaterThan(0);
});

test("saves the current file from the tab bar and with the keyboard shortcut", async ({ page }) => {
  await page.goto("/");

  const editor = page.getByRole("textbox", { name: "Solution code" });
  const original = await page.evaluate(() => fetch("/api/lesson").then((response) => response.json())) as { code: string };
  const workspaceBar = page.getByTestId("workspace-bar");
  const fileTab = page.getByRole("tab", { name: /solution\.ts/i });
  const save = workspaceBar.getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled();
  await expect(fileTab.getByRole("img", { name: "Saved" })).toBeVisible();
  await expect(workspaceBar.getByRole("button", { name: "Check" })).toBeVisible();
  await expect(page.locator("main > section").getByRole("button", { name: "Check" })).toHaveCount(1);

  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n// saved from the dojo");
  await expect(save).toBeEnabled();
  await expect(fileTab.getByRole("img", { name: "Unsaved changes" })).toBeVisible();
  await expect(fileTab.getByRole("img", { name: "Unsaved changes" })).toHaveCSS("color", "rgb(20, 203, 183)");

  const saveResponse = page.waitForResponse((response) => response.url().endsWith("/api/lesson/solution") && response.request().method() === "POST");
  await page.keyboard.press("ControlOrMeta+S");
  await expect((await saveResponse).ok()).toBe(true);
  await expect(save).toBeDisabled();
  await expect(fileTab.getByRole("img", { name: "Saved" })).toBeVisible();

  const snapshot = await page.evaluate(() => fetch("/api/lesson").then((response) => response.json())) as { code: string };
  expect(snapshot.code).toContain("saved from the dojo");
  await page.evaluate((code) => fetch("/api/lesson/solution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  }), original.code);
});

test("uses the Vercel dark palette in the editor", async ({ page }) => {
  const bundledFont = page.waitForResponse((response) => /iosevka.*\.woff2(?:\?|$)/.test(response.url()));
  await page.goto("/");

  expect((await bundledFont).ok()).toBe(true);
  await expect(page.locator(".cm-editor")).toHaveCSS("background-color", "rgb(10, 10, 10)");
  await expect(page.locator(".cm-editor")).toHaveCSS("font-family", /Iosevka/);
  await expect(page.locator(".cm-editor")).toHaveCSS("font-size", "16.5px");
  await expect(page.locator(".cm-line").first().locator("span").first()).toHaveCSS("color", "rgb(240, 91, 141)");
  await expect(page.locator(".cm-gutters")).toHaveCSS("border-right-color", "rgb(36, 36, 36)");
});

test("completes Effect members and marks unknown TypeScript names", async ({ page }) => {
  await page.route("**/api/lesson", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      briefing: "Practice typed Effect constructors.",
      checkpointed: false,
      code: 'import { Effect } from "effect";\nconst answer = Effect.su',
      dojo: "effect-ts",
      filePath: "katas/001-hello-effect/solution.ts",
      introduced: true,
      isCurrent: true,
      kata: "001-hello-effect",
      language: "typescript",
      lessons: [{ isCurrent: true, name: "001-hello-effect", state: "ongoing", summary: "Learn Effect constructors.", title: "Hello Effect" }],
      result: null,
      sessionId: null,
      state: "ongoing",
      title: "Hello Effect",
      transcript: [{ role: "assistant", text: "Begin when you are ready." }],
    }),
  }));
  await page.route("**/api/lesson/activity**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ status: "idle", reasoning: "", steps: [], context: {}, questions: null }),
  }));
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Solution code" });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText('import { Effect } from "effect";\nconst answer = Effect.');
  await page.keyboard.type("su");

  const completion = page.locator(".cm-tooltip-autocomplete");
  await expect(completion).toBeVisible();
  await expect(completion.getByText("succeed", { exact: true })).toBeVisible();
  await expect(completion).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(completion).toHaveCSS("border-radius", "0px");
  await expect(completion).toHaveCSS("border-left-color", "rgb(98, 166, 255)");
  await expect(completion.locator('[aria-selected="true"]')).toHaveCSS("background-color", "rgba(255, 255, 255, 0.1)");
  await expect(completion.locator(".cm-completionMatchedText").first()).toHaveCSS("text-decoration-line", "none");
  const editorLine = page.locator(".cm-line").last();
  const option = completion.locator("li").first();
  const lineBox = (await editorLine.boundingBox())!;
  const completionBox = (await completion.boundingBox())!;
  expect(completionBox.y).toBeGreaterThanOrEqual(lineBox.y + lineBox.height);
  expect((await option.boundingBox())!.height).toBeCloseTo(lineBox.height, 0);

  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("export const answer = unknownEffectValue;");
  const diagnostic = page.locator(".cm-lintRange-error");
  await expect(diagnostic).toBeVisible();
  await expect(diagnostic).toHaveCSS("text-decoration-style", "wavy");
  const errorMarker = page.locator(".cm-lint-marker-error");
  const errorLine = page.locator(".cm-line").last();
  const markerBox = (await errorMarker.boundingBox())!;
  const errorLineBox = (await errorLine.boundingBox())!;
  const editorFontSize = Number.parseFloat(await page.locator(".cm-editor").evaluate((editor) => getComputedStyle(editor).fontSize));
  expect(markerBox.width).toBeCloseTo(editorFontSize, 0);
  expect(markerBox.height).toBeCloseTo(editorFontSize, 0);
  expect(markerBox.y + markerBox.height / 2).toBeCloseTo(errorLineBox.y + errorLineBox.height / 2, 0);
  await errorMarker.hover({ position: { x: 1, y: 1 } });
  const errorTooltip = page.locator(".cm-tooltip-lint");
  await expect(errorTooltip).toContainText("Cannot find name 'unknownEffectValue'.");
  expect((await errorTooltip.boundingBox())!.width).toBeGreaterThanOrEqual(320);
  await expect(errorTooltip.locator(".cm-diagnosticText")).toHaveCSS("font-size", "13.5px");
  expect(await errorMarker.evaluate((marker) => getComputedStyle(marker).content)).toContain("svg");
  const foldGutterLine = page.locator(".cm-foldGutter .cm-gutterElement").first();
  await expect(foldGutterLine).toHaveCSS("padding-left", "0px");
  await expect(foldGutterLine).toHaveCSS("padding-right", "4px");
  expect((await page.locator(".cm-gutters").boundingBox())!.width).toBeLessThan(52);
});
