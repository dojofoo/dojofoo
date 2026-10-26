import { expect, test } from "@playwright/test";

for (const story of ["learner-kata", "course-authoring"]) test(`avatar settings opens the appearance page from ${story}`, async ({ page }) => {
  await page.goto(`/iframe.html?id=pages-dojo--${story}&viewMode=story`);
  const code = page.getByRole("textbox", { name: "Code editor", exact: true });
  await code.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n// account settings keeps this edit");
  await page.locator(".ui-as-user").click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("region", { name: "Account settings", exact: true });
  const heading = settings.getByRole("heading", { name: "Settings", exact: true });
  await expect(heading).toBeVisible();
  expect((await heading.boundingBox())!.y).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0);
  await expect(settings.getByRole("tab", { name: "Appearance", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(settings.getByRole("tab", { name: "Billing", exact: true })).toHaveCount(0);
  await expect(settings.getByRole("radiogroup", { name: "Theme", exact: true })).toBeVisible();
  await expect(settings.getByRole("radiogroup", { name: "Color scheme", exact: true })).toBeVisible();
  await expect(settings.getByRole("textbox", { name: "Code editor", exact: true })).toBeVisible();
  await settings.getByRole("radio", { name: "Japan Blues", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "japan-blues");
  await settings.getByRole("button", { name: "Back to workspace", exact: true }).click();
  await expect(page.getByRole("region", { name: "Course conversation", exact: true })).toBeVisible();
  await expect(page.locator(".view-lines")).toContainText("// account settings keeps this edit");
});

test("dashboard settings fits the main window on desktop and phone", async ({ page }) => {
  await page.goto("/iframe.html?id=pages-dojo--explore&viewMode=story");
  await page.locator(".ui-as-user").click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("region", { name: "Account settings", exact: true });
  await expect(settings.getByRole("textbox", { name: "Code editor", exact: true })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => (await settings.getByRole("heading", { name: "Settings", exact: true }).boundingBox())!.y).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.ui-as-main > .ui-as-main__scroll[aria-hidden="true"]')).toHaveCSS("visibility", "hidden");
  }
});

test("appearance rows align with the centered settings content", async ({ page }) => {
  await page.goto("/iframe.html?id=pages-dojo--settings&viewMode=story");
  const settings = page.getByRole("region", { name: "Account settings", exact: true });
  await expect(settings.getByRole("radio", { name: "Dojofoo", exact: true })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 900) await expect(page.locator(".ui-as-app")).toHaveAttribute("data-narrow", "true");
    else await expect(page.locator(".ui-as-app")).not.toHaveAttribute("data-narrow");
    // Read parent and children in one layout frame while the breakpoint reflows.
    await expect.poll(() => page.locator(".ui-sb__content").evaluate(content => {
      const body = content.getBoundingClientRect();
      const errors: string[] = [];
      for (const group of content.querySelectorAll('[role="radiogroup"]')) {
        const bounds = group.getBoundingClientRect();
        const name = group.getAttribute("aria-label");
        if (bounds.x < body.x || bounds.right > body.right + 1) errors.push(`${name} exceeds content`);
        for (const radio of group.querySelectorAll('[role="radio"]')) {
          const box = radio.getBoundingClientRect();
          if (Math.abs(box.x - bounds.x) >= 1 || Math.abs(box.width - bounds.width) >= 1) errors.push(`${name} row is shifted`);
        }
      }
      return errors;
    })).toEqual([]);
  }
});

test("theme fades and page changes use distinct native transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const native = document.startViewTransition.bind(document);
    (window as any).__fades = [];
    document.startViewTransition = ((update: () => void) => {
      const transition = native(update);
      transition.ready.then(() => {
        (window as any).__fades.push({
          types: Array.from(transition.types),
          old: getComputedStyle(document.documentElement, "::view-transition-old(root)").animationName,
          next: getComputedStyle(document.documentElement, "::view-transition-new(root)").animationName,
        });
      }).catch(() => {});
      return transition;
    }) as typeof document.startViewTransition;
  });
  await page.goto("/iframe.html?id=pages-dojo--explore&viewMode=story");
  await page.getByRole("button", { name: /^Courses/ }).first().click();
  await expect(page.getByRole("heading", { name: "Your courses", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__fades.length)).toBeGreaterThan(0);
  await page.locator(".ui-as-user").click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("region", { name: "Account settings", exact: true });
  await settings.getByRole("switch", { name: "Dark mode", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect.poll(() => page.evaluate(() => (window as any).__fades.length)).toBeGreaterThanOrEqual(3);
  const transitions = await page.evaluate(() => (window as any).__fades);
  expect(transitions.some((entry: any) => entry.types.includes("ui-theme") && entry.old === "ui-view-fade-out" && entry.next === "ui-view-fade-in")).toBe(true);
  expect(transitions.some((entry: any) => entry.types.includes("ui-navigation") && entry.old === "none" && entry.next === "none")).toBe(true);
});
