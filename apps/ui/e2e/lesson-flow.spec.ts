import { expect, test } from "@playwright/test";

test("senpai completes and resumes a Socratic kata", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /hello effect/i })).toBeVisible();
  await expect(page.locator(".cm-editor")).toBeVisible();
  await expect(page.locator('.cm-editor [aria-label="Solution code"]')).toHaveCount(1);
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

  await page.locator(".cm-editor").click();
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
  await expect(page.locator(".cm-editor")).toContainText(/Effect\.succeed/);
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
