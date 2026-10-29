import { expect, test } from "@playwright/test";

test("public course routes use the shared UIX presentation and one search owner", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const path of ["/", "/dojos", "/courses/dojofoo/effect-ts"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.locator(".ui-web")).toBeVisible();
    expect(await page.locator(".ui-web").evaluate(element => getComputedStyle(element).fontFamily)).toContain("Inter");
    if (path === "/") {
      expect(await page.locator("h1").evaluate(element => getComputedStyle(element).fontFamily)).toContain("Inter");
      const frame = await page.locator(".ui-web-app__frame").boundingBox();
      expect(frame!.width / frame!.height).toBeCloseTo(16 / 9, 2);
      await page.screenshot({ path: testInfo.outputPath("uix-home-desktop.png"), animations: "disabled" });
    }
    const header = page.locator("[data-site-navigation]");
    await expect(header.getByRole("link", { name: "Dojo.foo home" })).toHaveAttribute("href", "/");
    await expect(header.getByRole("link", { name: "Courses", exact: true })).toHaveAttribute("href", "/dojos");
    await expect(header.getByRole("link", { name: "Help", exact: true })).toHaveAttribute("href", "/docs");
    if (path === "/dojos") {
      const opened = page.context().waitForEvent("page");
      await page.locator(".ui-crs-grid").getByRole("link", { name: /^Effect TS/ }).click({ modifiers: ["ControlOrMeta"] });
      const tab = await opened;
      await expect(tab).toHaveURL(/\/courses\/dojofoo\/effect-ts$/);
      await expect(tab.getByRole("heading", { name: "Effect TS", exact: true })).toBeVisible();
      await tab.close();
    }
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.locator("dialog.ui-as-palette[open]");
    await expect(palette).toHaveCount(1);
    await expect(palette.getByRole("combobox")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);
  }
  await expect(page.getByRole("heading", { name: "Effect TS", exact: true })).toBeVisible();
  await expect(page.getByText("npx dojofoo add dojofoo/effect-ts", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "GitHub stars", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Security audits", exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/dojos$/);
  await expect(page.getByRole("heading", { name: "Find your dojo", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/courses\/dojofoo\/effect-ts$/);
  await expect(page.getByRole("heading", { name: "Effect TS", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const mobileFrame = await page.locator(".ui-web-app__frame").boundingBox();
  expect(mobileFrame!.width / mobileFrame!.height).toBeCloseTo(16 / 9, 2);
  await page.screenshot({ path: testInfo.outputPath("uix-home-mobile.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});


test("missing courses keep their 404 status inside the shared website frame", async ({ page }) => {
  const response = await page.goto("/courses/dojofoo/no-such-course");
  expect(response?.status()).toBe(404);
  await expect(page.locator(".ui-web")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to docs", exact: true })).toHaveAttribute("href", "/docs");
  await page.getByRole("link", { name: "Back to docs", exact: true }).click();
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByRole("heading", { name: "Usage", exact: true })).toBeVisible();
});
