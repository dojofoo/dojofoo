import { expect, test } from "@playwright/test";

test("docs hydrate and search opens", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/docs", { waitUntil: "networkidle" });
  await page.locator("[data-site-navigation]").getByRole("button", { name: "Open Search" }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
  const searchInput = page.getByPlaceholder("Search");
  await expect(searchInput).toBeVisible();
  await searchInput.fill("setup");
  await expect(page.getByRole("button", { name: /dojo setup/i }).first()).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  await page.goto("/docs/api");
  await expect(page.getByRole("heading", { name: "Courses API", level: 1 })).toBeVisible();
  await expect(page.getByText("POST /api/v1/events", { exact: false })).toBeVisible();
});
