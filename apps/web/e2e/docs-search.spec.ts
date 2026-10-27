import { expect, test } from "@playwright/test";

test("docs hydrate and search opens", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/docs", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Usage", level: 1 })).toHaveCSS("font-family", /Inter/);
  await expect(page.getByText("Dojo.foo turns your coding agent into a teacher.", { exact: false })).toHaveCSS("font-family", /Inter/);
  await expect(page.locator("pre").first()).toHaveCSS("font-family", /Iosevka/);
  const footerItem = page.locator(".ui-docs__pager a").first();
  await expect(footerItem).toBeVisible();
  await expect(footerItem).toHaveCSS("font-family", /Inter/);
  await expect(footerItem.locator("span")).toHaveCSS("font-family", /Inter/);
  expect(await page.evaluate(() => {
    window.scrollTo(0, 200);
    const navigation = document.querySelector<HTMLElement>(".ui-web-bar")!.getBoundingClientRect();
    const sidebar = document.querySelector<HTMLElement>(".ui-docs-tree")!.getBoundingClientRect();
    return sidebar.top >= navigation.bottom - 1;
  })).toBe(true);
  expect(await page.locator(".prose li").first().evaluate((element) =>
    getComputedStyle(element, "::marker").fontFamily,
  )).toMatch(/Inter/);
  await expect(page.getByRole("navigation", { name: "Documentation", exact: true }).getByRole("link", { name: "Dojos", exact: true })).toHaveCount(0);
  await page.locator("[data-site-navigation]").getByRole("button", { name: "Search docs" }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
  const searchInput = page.getByRole("combobox", { name: "Search docs" });
  await expect(searchInput).toBeVisible();
  await searchInput.fill("installation");
  await expect(page.getByRole("option", { name: /Installation/i }).first()).toBeVisible();
  await searchInput.fill("dojofoo ui");
  await expect(page.getByRole("option", { name: /npx dojofoo ui/i }).first()).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  await page.goto("/docs/commands/ui");
  await expect(page.getByText("https://dojo.localhost", { exact: true })).toBeVisible();

  await page.goto("/docs/api");
  await expect(page.getByRole("heading", { name: "API", level: 1 })).toBeVisible();
  await expect(page.getByText("https://dojo.foo/api/v1", { exact: true })).toBeVisible();

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
  })).toMatch(/Inter/);
});
