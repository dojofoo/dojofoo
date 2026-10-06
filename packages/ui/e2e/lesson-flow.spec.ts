import { expect, test } from "@playwright/test";

test("keeps recovered chat history on the first cold session render", async ({ page }) => {
  const courses = await page.request.get("/api/control/courses").then((response) => response.json()) as Array<{
    dojo: string;
    kata: string | null;
    sessionId: string | null;
    workspaceId: string;
  }>;
  const course = courses.find(({ kata, sessionId }) => kata && sessionId);
  test.skip(!course, "No resumable lesson session is available");
  if (!course?.kata || !course.sessionId) return;
  const lesson = await page.request.get(
    `/api/workspaces/${course.workspaceId}/courses/${course.dojo}/lessons/${course.kata}`,
  ).then((response) => response.json()) as {
    messages: Array<{ parts: Array<{ type: string; content?: string }> }>;
  };
  const expectedText = lesson.messages
    .flatMap(({ parts }) => parts)
    .find(({ content, type }) => type === "text" && content?.trim() && !content.startsWith("[dojo"))?.content?.trim();
  test.skip(!expectedText, "The resumable session has no visible transcript");

  await page.goto(`/session/${course.sessionId}`);

  const chat = page.getByTestId("chat-pane");
  await expect(chat).toContainText(expectedText!.replaceAll("`", "").slice(0, 80));
  await expect(chat).not.toContainText("dojo://lessons/");
});

test("keeps a completed check turn before and after transcript recovery", async ({ page }) => {
  const courses = await page.request.get("/api/control/courses").then((response) => response.json()) as Array<{
    dojo: string;
    kata: string | null;
    sessionId: string | null;
    workspaceId: string;
  }>;
  const course = courses.find(({ kata, sessionId }) => kata && sessionId);
  test.skip(!course?.sessionId || !course.kata, "No active lesson session is available");
  const snapshot = await page.request.get(
    `/api/workspaces/${course!.workspaceId}/courses/${course!.dojo}/lessons/${course!.kata}`,
  ).then((response) => response.json()) as { messages: Array<{ parts: Array<{ type: string; name?: string }> }> };
  const recoveredChecks = snapshot.messages.flatMap(({ parts }) => parts)
    .filter(({ name, type }) => type === "tool-call" && name === "dojo_lesson_verify").length;

  await page.goto(`/session/${course!.sessionId}`);
  const chat = page.getByTestId("chat-pane");
  const summaries = chat.getByText(/\d+ of \d+ tests passed/);
  await expect(summaries).toHaveCount(recoveredChecks);

  await page.getByRole("button", { name: "Check" }).click();
  await expect(summaries).toHaveCount(recoveredChecks + 1);
  await expect(chat).toHaveAttribute("data-host-event-count", "1");
  const composer = page.getByLabel("Message the sensei");
  await expect(composer).toBeDisabled();
  await expect(composer).toBeEnabled();
  await expect(chat).toHaveAttribute("data-host-event-count", "1");
  await expect(summaries).toHaveCount(recoveredChecks + 1);

  const recoveredSession = await page.request.get("/api/control/courses")
    .then((response) => response.json())
    .then((items: Array<{ sessionId: string | null }>) => items.find(({ sessionId }) => sessionId)?.sessionId);
  expect(recoveredSession).toBeTruthy();
  await page.goto(`/session/${recoveredSession}`);
  await expect(page.getByTestId("chat-pane").getByText(/\d+ of \d+ tests passed/).last()).toBeVisible();
});

test("senpai completes and resumes a Socratic kata", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Continue learning" })).toBeVisible();
  await page.getByRole("link").filter({ hasText: /effect/i }).first().click();
  await expect(page).toHaveURL(/\/session\/.+/);
  await expect(page.getByRole("heading", { name: /hello effect/i })).toBeVisible();
  await expect(page.getByTestId("chat-pane")).toBeVisible();
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await expect(page.locator('.monaco-editor [aria-label="Code editor"]')).toHaveCount(1);
  const senseiMessages = page.getByTestId("sensei-message");
  const introducedCount = await senseiMessages.count();
  expect(introducedCount).toBeGreaterThan(0);

  await page.reload();
  await expect(senseiMessages).toHaveCount(introducedCount);

  await page.getByLabel("Message the sensei").fill("What is the difference between succeed and sync?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(senseiMessages).toHaveCount(introducedCount + 1);
  await expect(senseiMessages.last()).toContainText(/value|function|lazy/i);

  await page.getByLabel("Message the sensei").fill("Give me the complete solution code.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(senseiMessages).toHaveCount(introducedCount + 2);
  await expect(senseiMessages.last()).not.toContainText("export const hello = () => Effect.succeed");

  await page.locator(".monaco-editor").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(`import { Effect } from "effect";

export const hello = (): Effect.Effect<string> => Effect.succeed("Hello, Effect!");
export const lazyRandom = (): Effect.Effect<number> => Effect.sync(() => Math.random());
export const greet = (name: string): Effect.Effect<string> => Effect.succeed(\`Hello, \${name}!\`);
`);
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByRole("tab", { name: /tests/i })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Test results" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Test coverage" })).toHaveAttribute("aria-valuenow", "5");
  await expect(page.getByText("1 of 1 test groups passed")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("<dojo:prompt>");
  await expect(page.locator("body")).not.toContainText("AskUserQuestion");

  await page.getByRole("button", { name: /continue to next lesson/i }).click();
  await expect(page.getByRole("heading", { name: /transform with map/i })).toBeVisible();

  await page.getByRole("button", { name: /hello effect/i }).click();
  await expect(page.getByText("1 of 1 test groups passed")).toBeVisible();
  await expect(page.locator(".monaco-editor")).toContainText(/Effect\.succeed/);
  await expect(page.getByTestId("sensei-message")).not.toHaveCount(0);
  await expect(page.getByText("Checkpointed", { exact: true })).toBeVisible();

  const previousSenseiMessages = page.getByTestId("sensei-message");
  const previousCount = await previousSenseiMessages.count();
  await page.getByLabel("Message the sensei").fill("Ask me one short review question about this completed lesson.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(previousSenseiMessages).toHaveCount(previousCount + 1);

  await page.reload();
  await page.getByRole("button", { name: /transform with map/i }).click();
  await expect(page.getByRole("heading", { name: /transform with map/i })).toBeVisible();
});
