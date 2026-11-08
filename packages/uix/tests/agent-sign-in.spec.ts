import { expect, test } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=components-molecules-agent-sign-in--${id}&viewMode=story`;

test("lists the agent's providers, signed-in ones first, and searches a long list", async ({ page }) => {
  await page.goto(story("pi-providers"));
  const dialog = page.getByRole("dialog", { name: "Sign in to Pi" });
  const providers = dialog.getByRole("list", { name: "Providers" }).getByRole("listitem");
  await expect(providers).toHaveCount(42);
  await expect(providers.nth(0)).toContainText("Signed in with DEEPSEEK_API_KEY");
  await expect(providers.nth(3)).not.toContainText("Signed in");
  await dialog.getByRole("searchbox", { name: "Search providers" }).fill("copilot");
  await expect(providers).toHaveCount(1);
  await expect(providers.getByRole("button", { name: "Sign in with GitHub Copilot" })).toBeVisible();
  await expect(providers.getByRole("button", { name: "Enter GitHub Copilot token" })).toBeVisible();
  await dialog.getByRole("searchbox", { name: "Search providers" }).fill("no such provider");
  await expect(dialog.getByText("No provider matches “no such provider”")).toBeVisible();
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

test("an API key is asked for as a password field and the provider then reads signed in", async ({ page }) => {
  await page.goto(story("codex-providers"));
  await page.getByRole("button", { name: "Enter OpenAI API key" }).click();
  const key = page.getByLabel("Enter your OpenAI API key");
  await expect(key).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await key.fill("sk-story");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Signed in.")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Sign in…" }).click();
  await expect(page.getByRole("dialog", { name: "Sign in to Codex" }).getByRole("listitem")).toContainText("Signed in");
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
