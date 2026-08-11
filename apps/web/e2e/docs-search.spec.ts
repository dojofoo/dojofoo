import { expect, test } from "@playwright/test";

test("docs hydrate and search opens", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/docs", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Documentation", level: 1 })).toHaveCSS("font-family", /Iosevka/);
  await expect(page.getByText("dojocho is a kata-driven training framework", { exact: false })).toHaveCSS("font-family", /Geist Variable/);
  await expect(page.locator("pre").first()).toHaveCSS("font-family", /Iosevka/);
  expect(await page.locator(".prose li").first().evaluate((element) =>
    getComputedStyle(element, "::marker").fontFamily,
  )).toMatch(/Iosevka/);
  await expect(page.locator("[data-header-tabs]").getByText("Dojos", { exact: true })).toHaveCount(0);
  await page.locator("[data-site-navigation]").getByRole("button", { name: "Open Search" }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
  const searchInput = page.getByPlaceholder("Search");
  await expect(searchInput).toBeVisible();
  await searchInput.fill("setup");
  await expect(page.getByRole("button", { name: /npx dojofoo install/i }).first()).toBeVisible();
  await searchInput.fill("dojofoo ui");
  await expect(page.getByRole("button", { name: /npx dojofoo ui/i }).first()).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  await page.goto("/docs/commands/ui");
  await expect(page.getByText("https://dojo.localhost", { exact: true })).toBeVisible();

  await page.goto("/docs/api");
  await expect(page.getByRole("heading", { name: "Courses API", level: 1 })).toBeVisible();
  await expect(page.getByText("POST /api/v1/events", { exact: false })).toBeVisible();

  expect(await page.evaluate(() => {
    const prose = document.createElement("div");
    prose.className = "font-prose";
    const quote = document.createElement("blockquote");
    quote.textContent = "A quoted lesson rule";
    prose.append(quote);
    document.body.append(prose);
    const family = getComputedStyle(quote).fontFamily;
    prose.remove();
    return family;
  })).toMatch(/Iosevka/);
});
