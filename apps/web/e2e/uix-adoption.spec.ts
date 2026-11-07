import { expect, test } from "@playwright/test";

test("shared site links use one router navigation and preserve Back and Forward", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.evaluate(() => {
    document.documentElement.dataset.navigationProbe = "same-document";
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = ((...args: Parameters<typeof original>) => {
      document.documentElement.dataset.routeTransitions = String(Number(document.documentElement.dataset.routeTransitions ?? 0) + 1);
      return original(...args);
    }) as typeof original;
  });
  const initialHistory = await page.evaluate(() => history.length);
  const header = page.locator("[data-site-navigation]");
  await header.getByRole("link", { name: "Courses", exact: true }).click();
  await expect(page).toHaveURL(/\/dojos$/);
  await expect(page.getByRole("heading", { name: "Find your dojo", exact: true })).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(initialHistory + 1);
  await expect(page.locator("html")).toHaveAttribute("data-route-transitions", "1");
  await page.locator(".ui-crs-grid").getByRole("link", { name: /^Effect TS/ }).click();
  await expect(page).toHaveURL(/\/courses\/dojofoo\/effect-ts$/);
  await expect(page.getByRole("heading", { name: "Effect TS", exact: true })).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(initialHistory + 2);
  await expect(page.locator("html")).toHaveAttribute("data-route-transitions", "2");
  await page.goBack();
  await expect(page).toHaveURL(/\/dojos$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/courses\/dojofoo\/effect-ts$/);
  await header.getByRole("link", { name: "Help", exact: true }).click();
  await expect(page).toHaveURL(/\/docs$/);
  await page.getByRole("complementary", { name: "Pages", exact: true }).getByRole("link", { name: "Quickstart", exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/quickstart$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.locator("html")).toHaveAttribute("data-navigation-probe", "same-document");
  expect(errors).toEqual([]);
});

test("public course routes use the shared UIX presentation and one search owner", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const path of ["/", "/dojos", "/courses/dojofoo/effect-ts"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
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
  expect(errors).toEqual([]);
});

test("the static landing illustration keeps its narrow layout without mock controls", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // The static illustration keeps the app's narrow layout without exposing mock controls.
  const preview = page.locator(".ui-web-app[data-phone]");
  await expect(preview).toBeVisible();
  const mobileFrame = await preview.locator(".ui-web-app__frame").boundingBox();
  expect(mobileFrame!.height).toBeGreaterThan(mobileFrame!.width);
  await expect(preview).toHaveAttribute("role", "img");
  await expect(preview.getByRole("button")).toHaveCount(0);
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
