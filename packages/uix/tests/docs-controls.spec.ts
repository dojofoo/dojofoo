import { expect, test } from "@playwright/test";

test("website stories retain theme preference across navigation with the same native fades", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const native = document.startViewTransition.bind(document);
    (window as any).__transitions = [];
    document.startViewTransition = ((options: any) => {
      const transition = native(options);
      transition.ready.then(() => (window as any).__transitions.push({ types: Array.from(transition.types), mode: document.documentElement.classList.contains("dark") ? "dark" : "light" })).catch(() => {});
      return transition;
    }) as typeof document.startViewTransition;
  });
  await page.goto("/iframe.html?id=docs-documentation--cli&viewMode=story&globals=theme:dark");
  const toggle = page.locator("footer").getByRole("button", { name: /^Theme:/ });
  await expect(toggle).toHaveAccessibleName(/^Theme: dark/);
  await toggle.click();
  await expect(toggle).toHaveAccessibleName(/^Theme: system/);
  await expect.poll(() => page.evaluate(() => (window as any).__transitions.filter((entry: any) => entry.types.includes("ui-theme")).length)).toBe(1);
  await page.getByRole("navigation", { name: "Site", exact: true }).getByRole("link", { name: "Courses", exact: true }).click();
  await expect(page.locator(".ui-crs-grid")).toBeVisible();
  await expect(toggle).toHaveAccessibleName(/^Theme: system/);
  await toggle.click();
  await expect(toggle).toHaveAccessibleName(/^Theme: light/);
  await toggle.click();
  await expect(toggle).toHaveAccessibleName(/^Theme: dark/);
  await expect.poll(() => page.evaluate(() => (window as any).__transitions.filter((entry: any) => entry.types.includes("ui-theme")))).toEqual([{ types: ["ui-theme"], mode: "light" }, { types: ["ui-theme"], mode: "dark" }]);
});

test("mobile documentation stories fold the pages into the menu and the outline into a bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/iframe.html?id=docs-documentation--cli&viewMode=story");
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const navigation = page.getByRole("dialog", { name: "Menu", exact: true });
  await navigation.getByRole("link", { name: "Quickstart", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Quickstart", exact: true })).toBeVisible();
  await expect(navigation).toBeHidden();
  await page.getByRole("button", { name: "On this page", exact: true }).click();
  const outline = page.locator(".ui-docs-tocbar__outline");
  await outline.getByRole("link").first().click();
  await expect(outline).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
