import { expect, test } from "@playwright/test";

test("appearance keeps the chosen mode across reloads and native pages", async ({ page }) => {
  const writes: string[] = [];
  await page.route("**/api/**", route => {
    if (route.request().method() !== "GET") writes.push(route.request().url());
    return route.fulfill({ json: [] });
  });
  await page.goto("/settings?tab=Appearance");
  const mode = page.getByRole("switch", { name: "Dark mode", exact: true });
  await expect(mode).toBeChecked();
  await mode.click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("dojofoo.theme")), { timeout: 5_000 }).toBe("light");
  await page.reload();
  await expect(mode).not.toBeChecked();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.screenshot({ path: test.info().outputPath("appearance-mode-light-reloaded.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Back to workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your courses", exact: true })).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.goto("/avatar");
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("dojofoo.theme"))).toBe("dark");
  await page.goto("/settings?tab=Appearance");
  await expect(mode).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(writes).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("appearance-mode-restored.png"), animations: "disabled" });
});

test("a saved light preference applies before client hydration", async ({ page }) => {
  let scriptsBlocked = 0;
  await page.addInitScript(() => localStorage.setItem("dojofoo.theme", "light"));
  await page.route("**/*", route => {
    if (route.request().resourceType() !== "script") return route.continue();
    scriptsBlocked += 1;
    return route.abort();
  });
  await page.goto("/settings?tab=Appearance", { waitUntil: "domcontentloaded" });
  expect(scriptsBlocked).toBeGreaterThan(0);
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
});

test("blocked storage keeps appearance usable for the current visit", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem"] as const) Object.defineProperty(Storage.prototype, method, {
      configurable: true, value() { throw new DOMException("Storage is unavailable", "SecurityError"); },
    });
  });
  await page.goto("/settings?tab=Appearance");
  const mode = page.getByRole("switch", { name: "Dark mode", exact: true });
  await expect(mode).toBeChecked();
  await mode.click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await mode.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(errors).toEqual([]);
});

test("an unknown saved mode retains the native dark default", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dojofoo.theme", "unknown"));
  await page.goto("/settings?tab=Appearance");
  await expect(page.getByRole("switch", { name: "Dark mode", exact: true })).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
