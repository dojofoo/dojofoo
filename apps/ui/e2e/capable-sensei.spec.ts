import { expect, test } from "@playwright/test";

test("a fresh lesson follows DOJO and SENSEI guidance and can inspect its tests", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 2, name: /hello effect/i })).toBeVisible();
  const introduction = page.getByTestId("sensei-message").first();
  await expect(introduction).toContainText(/create|effect/i);
  await expect(introduction).toContainText(/succeed|sync|lazi|defer/i);

  const composer = page.getByLabel("Message the sensei");
  await composer.fill("Run the current kata tests and tell me the exact JSON totals.");
  await composer.press("Enter");

  const response = page.getByTestId("sensei-streaming-message").last();
  await expect(response).toContainText(/"total"\s*:\s*5/i, { timeout: 60_000 });
  await expect(response).toContainText(/"passed"\s*:\s*0/i);
  await expect(response).not.toContainText(/paste it here|can.?t execute|cannot execute/i);
});

test("passing tests lets the sensei wrap up and advance with the senpai's consent", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: /hello effect/i })).toBeVisible();
  await page.locator(".cm-editor").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(`import { Effect } from "effect";

export const hello = (): Effect.Effect<string> => Effect.succeed("Hello, Effect!");
export const lazyRandom = (): Effect.Effect<number> => Effect.sync(() => Math.random());
export const greet = (name: string): Effect.Effect<string> => Effect.succeed(\`Hello, \${name}!\`);
`);

  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("1 of 1 test groups passed")).toBeVisible();
  await expect(page.getByRole("heading", { name: /proceed|next|what.*like/i })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("radio", { name: /^Review/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Move on/i })).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Pause/i })).toBeVisible();

  await page.getByRole("radio", { name: /^Move on/i }).click();
  await expect(page.getByRole("heading", { level: 2, name: /transform with map/i })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("sensei-message").last()).toContainText(/map|transform/i);
});
