import { expect, test } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=components-molecules-agent-sign-in--${id}&viewMode=story`;

test("lists the providers the agent signs in to in the browser, signed-in ones first, and offers no keys", async ({ page }) => {
  await page.goto(story("pi-providers"));
  const dialog = page.getByRole("dialog", { name: "Sign in to Pi" });
  const providers = dialog.getByRole("list", { name: "Providers" }).getByRole("listitem");
  await expect(providers).toHaveCount(9);
  await expect(providers.nth(0)).toContainText("GitHub Copilot");
  await expect(providers.nth(0)).toContainText("Signed in");
  await expect(dialog.getByRole("button", { name: /API key|Enter / })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Sign in with GitHub Copilot" })).toBeVisible();
});

test("opened from a model whose login lapsed, it lists only that provider", async ({ page }) => {
  await page.goto(story("lapsed-login"));
  const providers = page.getByRole("dialog", { name: "Sign in to Pi" }).getByRole("listitem");
  await expect(providers).toHaveCount(1);
  await expect(providers).toContainText("GitHub Copilot");
});

test("OpenCode lists its own browser sign-ins and no keys", async ({ page }) => {
  await page.goto(story("open-code-providers"));
  const dialog = page.getByRole("dialog", { name: "Sign in to OpenCode" });
  await expect(dialog.getByRole("listitem")).toHaveCount(7);
  await expect(dialog.getByRole("button", { name: "Login with GitHub Copilot" })).toBeVisible();
  await expect(dialog.getByText("Azure", { exact: true })).toHaveCount(0);
});

test("a browser sign-in shows its page, waits, and ends signed in", async ({ page }) => {
  await page.goto(story("codex-providers"));
  await page.getByRole("button", { name: "Sign in with ChatGPT" }).click();
  const dialog = page.getByRole("dialog", { name: "Sign in to OpenAI" });
  await expect(dialog.getByRole("link", { name: "Open the sign-in page" })).toHaveAttribute("target", "_blank");
  await expect(dialog.getByText("Waiting for you to finish in the browser…")).toBeVisible();
  await expect(dialog.getByText("Signed in.")).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

test("a failed sign-in says why and goes back to the providers", async ({ page }) => {
  await page.goto(story("failed"));
  const dialog = page.getByRole("dialog", { name: "Sign in to OpenAI" });
  await expect(dialog.getByRole("alert")).toHaveText("Access denied");
  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("dialog", { name: "Sign in to Codex" }).getByRole("button", { name: "Sign in with ChatGPT" })).toBeVisible();
});

test("an agent signed in to nothing offers its sign-in where the model menu would be", async ({ page }) => {
  await page.goto(story("composer-sign-in-needed"));
  await expect(page.getByRole("button", { name: /^Model:/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign in to Codex" }).click();
  await expect(page.getByRole("dialog", { name: "Sign in to Codex" })).toBeVisible();
});
