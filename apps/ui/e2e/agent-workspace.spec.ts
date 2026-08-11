import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";

test("uses the dark lesson workspace with an accessible chapter accordion", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByText("Dojo", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: /effect ts/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Course" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Chapters" })).toBeVisible();
  await expect(page.getByTestId("lesson-scroll").locator('[data-slot="scroll-area-viewport"]')).toHaveCSS("overflow-y", "scroll");
  await expect(page.getByRole("button", { name: /transform with map/i })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("lesson-scroll").getByText(/transform effect values/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /hello effect/i })).not.toContainText(/completed/i);

  const current = page.getByRole("button", { name: /transform with map/i });
  const upcoming = page.getByRole("button", { name: /generator pipelines/i });
  await expect(current.getByRole("img", { name: "Current lesson" })).toBeVisible();
  await expect(page.getByRole("button", { name: /hello effect/i }).getByRole("img", { name: "Completed lesson" })).toBeVisible();
  await expect(upcoming).toHaveAttribute("data-navigation-disabled", "true");
  await expect(upcoming).toHaveAttribute("aria-description", /expand to preview/i);
  await expect(upcoming.getByRole("img", { name: "Upcoming lesson" })).toBeVisible();

  const lessonTitle = page.getByTestId("lesson-pane").getByRole("heading", { level: 2 }).first();
  const currentTitle = await lessonTitle.textContent();
  const currentContent = current.locator("xpath=../..").getByRole("region");
  const upcomingContent = upcoming.locator("xpath=../..").getByRole("region");
  await upcoming.click();
  await expect(current).toHaveAttribute("aria-expanded", "false");
  await expect(upcoming).toHaveAttribute("aria-expanded", "true");
  await expect(currentContent).toHaveCSS("animation-name", "lesson-accordion-up");
  await expect(upcomingContent).toHaveCSS("animation-name", "lesson-accordion-down");
  await expect(page.getByTestId("lesson-scroll").getByText(/imperative-style Effect pipelines/i)).toBeVisible();
  const contentId = await upcoming.getAttribute("aria-controls");
  const content = page.locator(`#${contentId}`);
  await expect(content).toHaveCSS("animation-name", "lesson-accordion-down");
  await expect(content).toHaveCSS("animation-duration", "0.16s");
  const contentPadding = content.locator(":scope > div");
  await expect(contentPadding).toHaveCSS("padding-left", "16px");
  await expect(contentPadding).toHaveCSS("padding-top", "16px");
  await expect(contentPadding).toHaveCSS("padding-bottom", "16px");
  await expect(lessonTitle).toHaveText(currentTitle ?? "");

  await current.click();
  await expect(upcoming).toHaveAttribute("aria-expanded", "false");
  await expect(current).toHaveAttribute("aria-expanded", "true");
  const completedTrigger = page.getByRole("button", { name: /hello effect/i });
  await page.route("**/api/lesson/001-hello-effect", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 220));
    await route.continue();
  }, { times: 1 });
  await completedTrigger.click();
  await expect(current).toHaveAttribute("aria-expanded", "false");
  await expect(completedTrigger).toHaveAttribute("aria-expanded", "true");
  await expect(lessonTitle).toHaveText(currentTitle ?? "");
  await expect(completedTrigger.locator("xpath=../..").getByRole("region")).toHaveCSS("animation-name", "lesson-accordion-down");
  await expect(lessonTitle).toHaveText(/hello effect/i);
  await expect(page.getByText("Completed lesson", { exact: true })).toHaveClass(/text-emerald-400/);
  await expect(completedTrigger).toHaveAttribute("aria-expanded", "true");

  const sidebar = page.locator("aside").first();
  const chapter = upcoming.locator("xpath=../..");
  const [sidebarBox, chapterBox] = await Promise.all([sidebar.boundingBox(), chapter.boundingBox()]);
  expect(sidebarBox).not.toBeNull();
  expect(chapterBox).not.toBeNull();
  expect(chapterBox!.x).toBe(sidebarBox!.x);
  expect(chapterBox!.width).toBeGreaterThan(sidebarBox!.width - 16);
  await expect(chapter).toHaveCSS("border-radius", "0px");
  await expect(upcoming).toHaveCSS("padding-top", "16px");
  await expect(upcoming).toHaveCSS("padding-bottom", "16px");
  await expect(page.getByTestId("lesson-scroll").locator('button[aria-expanded="true"]')).toHaveCount(1);
  const chapterItems = page.getByTestId("lesson-scroll").locator('[data-lesson-state]');
  await expect(chapterItems.first()).toHaveCSS("border-top-width", "0px");
  await expect(chapterItems.last()).toHaveCSS("border-bottom-width", "0px");
});

test("presents the coding canvas first and gives chat a golden-ratio share", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");

  const lessonPane = page.getByTestId("lesson-pane");
  const workspace = page.getByTestId("lesson-workspace");
  const chatPane = page.getByTestId("chat-pane");
  const title = lessonPane.getByRole("heading", { level: 2 }).first();
  const [lessonBox, workspaceBox, chatBox, titleBox] = await Promise.all([
    lessonPane.boundingBox(),
    workspace.boundingBox(),
    chatPane.boundingBox(),
    title.boundingBox(),
  ]);

  expect(lessonBox).not.toBeNull();
  expect(workspaceBox).not.toBeNull();
  expect(chatBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(workspaceBox!.x).toBeCloseTo(lessonBox!.x, 0);
  expect(workspaceBox!.width).toBeCloseTo(lessonBox!.width, 0);
  expect(workspaceBox!.y).toBeCloseTo(lessonBox!.y, 0);
  expect(workspaceBox!.y + workspaceBox!.height).toBeLessThan(titleBox!.y);
  expect(chatBox!.width / (lessonBox!.width + chatBox!.width)).toBeGreaterThan(0.36);
  expect(chatBox!.width / (lessonBox!.width + chatBox!.width)).toBeLessThan(0.4);

  const canvasBox = await page.getByTestId("lesson-canvas").boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox!.width / canvasBox!.height).toBeCloseTo(16 / 9, 1);
  await expect(page.locator(".cm-editor")).toBeVisible();
  await expect.poll(() => page.locator(".cm-content .cm-line-failed").count()).toBeGreaterThan(0);
});

test("shows the current agent action in the chat header", async ({ page }) => {
  await page.route("**/api/lesson/activity**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "thinking",
        reasoning: "Reviewing the lesson constraints",
        steps: [
          { id: "response", label: "Responding", icon: "message-circle", status: "active" },
        ],
        context: { usedTokens: 100, maxTokens: 1000, inputTokens: 80, outputTokens: 20, reasoningTokens: 10, cachedTokens: 0 },
        questions: null,
      }),
    });
  });
  await page.goto("/");

  const status = page.getByTestId("agent-current-action");
  await expect(status).toHaveText("Responding");
  await expect(status).toHaveClass(/shimmer-text/);
  await expect(page.getByTestId("agent-reasoning")).toContainText("Reviewing the lesson constraints");
  await expect(page.getByTestId("agent-activity")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /agent context/i })).toHaveCount(0);
  const composer = page.getByTestId("chat-composer");
  await expect(composer).toHaveCSS("padding-left", "0px");
  await expect(composer).toHaveCSS("padding-right", "0px");
  await expect(composer).toHaveCSS("padding-bottom", "0px");
});

test("uses Fluid scroll fade on the chapters viewport", async ({ page }) => {
  await page.goto("/");

  const chapterViewport = page.getByTestId("lesson-scroll").locator('[data-slot="scroll-area-viewport"]');
  await expect(chapterViewport).toHaveClass(/scroll-fade/);
  await expect(chapterViewport).toHaveCSS("mask-image", /linear-gradient/);
});

test("uses scroll fade for chat and copies the Codex session id", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://dojo.td" });
  await page.goto("/");
  const snapshot = await page.evaluate(() => fetch("/api/lesson").then((response) => response.json())) as { sessionId: string };
  expect(snapshot.sessionId).toBeTruthy();

  const chatViewport = page.getByTestId("chat-pane").locator('[data-slot="scroll-area-viewport"]');
  await expect(chatViewport).toHaveClass(/scroll-fade/);
  await page.getByRole("button", { name: "Copy Codex session ID" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(snapshot.sessionId);
});

test("draws one divider at each side of the lesson container", async ({ page }) => {
  await page.goto("/");

  const chapters = page.getByTestId("lesson-navigation");
  const chat = page.getByTestId("chat-pane");
  await expect(chapters).toHaveCSS("border-right-style", "dashed");
  await expect(chapters).toHaveCSS("border-right-width", "1px");
  await expect(chapters).toHaveCSS("box-shadow", "none");
  await expect(chat).toHaveCSS("border-left-style", "dashed");
  await expect(chat).toHaveCSS("border-left-width", "1px");
  await expect(chat).toHaveCSS("box-shadow", "none");
});

test("renders streamed Codex app-server chat events", async ({ page }) => {
  await page.route("**/api/lesson/chat", async (route) => {
    const body = route.request().postDataJSON() as { kata?: string; message?: string };
    expect(body.message).toBe("Can you clarify Effect.map?");
    await route.fulfill({
      contentType: "text/event-stream",
      body: [
        `data: ${JSON.stringify({ type: "start", messageId: "message-test" })}\n\n`,
        `data: ${JSON.stringify({ type: "text-start", id: "text-test" })}\n\n`,
        `data: ${JSON.stringify({ type: "text-delta", id: "text-test", delta: "Streamed from Codex with `Effect.map`." })}\n\n`,
        `data: ${JSON.stringify({ type: "text-end", id: "text-test" })}\n\n`,
        `data: ${JSON.stringify({ type: "finish" })}\n\n`,
        "data: [DONE]\n\n",
      ].join(""),
    });
  });

  await page.goto("/");
  const composer = page.getByLabel("Message the sensei");
  await composer.fill("Can you clarify Effect.map?");
  await composer.press("Enter");

  await expect(page.getByTestId("sensei-streaming-message")).toContainText("Streamed from Codex");
  const inlineCode = page.getByTestId("sensei-streaming-message").getByText("Effect.map", { exact: true });
  await expect(inlineCode).toHaveCSS("background-color", "rgb(10, 10, 10)");
  await expect(inlineCode).toHaveCSS("font-size", "14px");
  await expect(inlineCode).toHaveCSS("color", "rgb(237, 237, 237)");
  await expect(page.getByTestId("senpai-streaming-message")).toContainText("Can you clarify Effect.map?");
});

test("uses the official favicon and horizontal Dojofoo wordmark in the page chrome", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('link[rel="icon"][href="/favicon.svg"]')).toHaveCount(1);
  const favicon = await page.evaluate(() => fetch("/favicon.svg").then(async (response) => ({
    status: response.status,
    text: await response.text(),
  })));
  expect(favicon.status).toBe(200);
  expect(favicon.text).toContain('viewBox="0 0 618 619"');
  expect(createHash("sha256").update(favicon.text).digest("hex")).toBe("4d827eeec5b5f2876d7e9190973157c24723156c90a985a7d784fcd5bb0f6099");
  const wordmark = page.getByRole("img", { name: "Dojofoo wordmark" });
  await expect(wordmark).toBeVisible();
  await expect(wordmark).toHaveAttribute("src", /dojofoo/);
  await expect(wordmark).not.toHaveAttribute("src", "/favicon.svg");
  const box = await wordmark.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(box!.height * 3);
  await expect(page.getByText("Dojo", { exact: true })).toHaveCount(0);
});

test("keeps completed lesson chats available and scoped to that lesson", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /hello effect/i }).click();

  const composer = page.getByLabel("Message the sensei");
  await expect(composer).toBeVisible();
  await expect(page.getByPlaceholder("Ask about the lesson…")).toBeVisible();
  await expect(page.getByTestId("agent-current-action")).toHaveCount(0);
});

test("keeps code and test results in compact non-closeable tabs", async ({ page }) => {
  await page.goto("/");

  const codeTab = page.getByRole("tab", { name: /solution\.ts/i });
  const testsTab = page.getByRole("tab", { name: /tests/i });
  await expect(codeTab).toHaveAttribute("aria-selected", "true");
  await expect(testsTab).toBeVisible();
  await expect(testsTab).toContainText(/\d+%/);
  await expect(page.locator(".cm-content .cm-line-covered")).not.toHaveCount(0);
  await expect(page.getByRole("button", { name: /close.*(?:solution|tests)/i })).toHaveCount(0);
  await testsTab.click();
  await expect(testsTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Test results" })).toBeVisible();
  await expect(page.getByText("0 of 1 test groups passed")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Test progress" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Line coverage" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^002 — Transform with Map/ })).toBeVisible();
  await expect(page.getByTestId("test-stack-trace")).toHaveCount(0);
  await expect(page.getByText("Lesson checks", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Run the lesson checks to see test coverage.")).toHaveCount(0);
});

test("shows completed lesson pass rate in the Tests tab", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /hello effect/i }).click();

  await expect(page.getByRole("tab", { name: /tests/i })).toContainText("100%");
  await expect(page.locator(".cm-content .cm-line-covered")).not.toHaveCount(0);
  await page.getByRole("tab", { name: /tests/i }).click();
  await expect(page.getByRole("button", { name: /^001 — Hello Effect/ })).toBeVisible();
});

test("shows the test runner before results and does not require a chat response", async ({ page }) => {
  await page.goto("/");
  const snapshot = await page.evaluate(() => fetch("/api/lesson").then((response) => response.json()));

  await page.route("**/api/lesson/check", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...snapshot,
        code: "const example = () => {\n  return 1;\n};\nvoid 0;",
        result: {
          passed: 1,
          failed: 0,
          skipped: 0,
          total: 1,
          complete: true,
          tests: [{
            name: "uses the senpai solution",
            suite: ["Effect map"],
            filePath: "solution.test.ts",
            status: "passed",
            failureMessages: [],
            durationMs: 0.059291999999999234,
          }],
          coverage: {
            lines: { covered: 1, total: 2, percentage: 50 },
            lineHits: { "1": 1, "2": 1, "3": 1, "4": 0 },
          },
        },
      }),
    });
  });

  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByRole("tab", { name: /tests/i })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Running kata tests…")).toBeVisible();
  await expect(page.getByText("1 of 1 test groups passed")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Effect map/ })).toBeVisible();
  await expect(page.getByText("uses the senpai solution", { exact: true })).toBeVisible();
  await expect(page.getByText("Lesson checks", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("progressbar", { name: "Test progress" })).toHaveAttribute("aria-valuenow", "1");
  await expect(page.getByText("1/1 tests passed")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Test progress" }).getByText("100%", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Line coverage" })).toHaveCount(0);
  await expect(page.getByText("<1ms", { exact: true })).toBeVisible();
  const suite = page.getByRole("button", { name: /^Effect map/ });
  const stats = page.getByTestId("suite-stats-Effect map");
  const [suiteBox, statsBox] = await Promise.all([suite.boundingBox(), stats.boundingBox()]);
  expect(suiteBox).not.toBeNull();
  expect(statsBox).not.toBeNull();
  expect(suiteBox!.x + suiteBox!.width - (statsBox!.x + statsBox!.width)).toBeLessThan(20);
  await page.getByRole("tab", { name: /solution\.ts/i }).click();
  await expect(page.locator(".cm-content .cm-line-covered")).toHaveCount(3);
  await expect(page.locator(".cm-content .cm-line-uncovered")).toHaveCount(0);
  await expect(page.locator(".cm-content .cm-line-covered").first()).toHaveCSS("box-shadow", "none");
  await expect(page.locator(".cm-lineNumbers .cm-line-covered")).toHaveCount(3);
  await expect(page.locator(".cm-lineNumbers .cm-line-covered").first()).toHaveCSS("color", "rgb(111, 159, 114)");
});

test("uses SVG fold controls and an icon-only folded placeholder", async ({ page }) => {
  await page.goto("/");

  const fold = page.locator('.cm-foldGutter span[title="Fold line"]:visible').first();
  await expect(fold.locator("svg")).toBeVisible();
  await expect(fold).toHaveText("");
  await fold.click();
  const placeholder = page.locator(".cm-foldPlaceholder").first();
  await expect(placeholder.locator("svg")).toBeVisible();
  await expect(placeholder).toHaveText("");
});

test("uses Vercel blue for the enabled Check action", async ({ page }) => {
  await page.goto("/");

  const check = page.getByRole("button", { name: "Check" });
  await expect(check).toHaveCSS("background-color", "rgb(0, 112, 243)");
  await expect(check).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(check).toHaveCSS("cursor", "pointer");
  await expect(page.getByRole("tab", { name: /tests/i })).toHaveCSS("cursor", "pointer");
});

test("shows agent activity while sending from the message composer", async ({ page }) => {
  let sent = false;
  await page.route("**/api/lesson/activity**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(sent ? {
        status: "thinking",
        steps: [{ id: "command", label: "Running a command", description: "npx dojofoo kata --check --reporter=json", icon: "monitor", status: "active" }],
        context: { usedTokens: 0, maxTokens: 1, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0 },
        questions: null,
      } : {
        status: "idle",
        steps: [],
        context: { usedTokens: 0, maxTokens: 1, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0 },
        questions: null,
      }),
    });
  });
  await page.route("**/api/lesson/chat", async (route) => {
    sent = true;
    await route.fulfill({
      contentType: "text/event-stream",
      body: [
        `data: ${JSON.stringify({ type: "start", messageId: "message-activity" })}\n\n`,
        `data: ${JSON.stringify({ type: "text-start", id: "text-activity" })}\n\n`,
        `data: ${JSON.stringify({ type: "text-delta", id: "text-activity", delta: "Try inspecting the mapped value." })}\n\n`,
        `data: ${JSON.stringify({ type: "text-end", id: "text-activity" })}\n\n`,
        `data: ${JSON.stringify({ type: "finish" })}\n\n`,
        "data: [DONE]\n\n",
      ].join(""),
    });
  });
  await page.goto("/");

  const action = page.getByTestId("agent-current-action");
  await expect(action).toHaveCount(0);
  const composer = page.getByLabel("Message the sensei");
  await composer.fill("What value does Effect.map transform?");
  await composer.press("Enter");

  await expect(page.getByTestId("agent-current-action")).toHaveText("Running a command");
  await expect(page.getByTestId("agent-current-action")).toHaveClass(/shimmer-text/);
  await expect(page.getByTestId("agent-activity")).toHaveCount(0);
  await expect(page.getByLabel("Sensei is thinking")).toHaveCount(0);
  await expect(page.getByTestId("sensei-streaming-message")).toBeVisible();
  await expect(page.getByText("Sensei is thinking")).toBeHidden();
});

test("renders AskUser tool requests and returns the selected answer", async ({ page }) => {
  await page.goto("/");
  const composer = page.getByLabel("Message the sensei");
  await composer.fill("Use ask_learner to ask which kind of hint I want: Conceptual hint or Debugging hint.");
  await composer.press("Enter");

  await expect(page.getByRole("heading", { name: /which kind of hint/i })).toBeVisible();
  await page.getByRole("radio", { name: /conceptual hint/i }).click();
  await expect(page.getByRole("heading", { name: /which kind of hint/i })).toBeHidden();
  await expect(composer).toBeEnabled();
  await expect(page.getByTestId("agent-activity")).toHaveCount(0);
});
