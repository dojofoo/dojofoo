import { expect, test } from "@playwright/test";

// Headless Chrome normally hides scrollbars, concealing the gutter that moves the header.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("site navigation stays aligned across long and short pages and the quote stays inline", async ({ page }) => {
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 1200 });
    const positions: unknown[] = [];
    for (const path of ["/", "/dojos", "/docs"]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
      await page.evaluate(() => document.fonts.ready);
      positions.push(await page.locator("[data-site-navigation]").evaluate(nav => {
        const box = (element: Element) => {
          const { x, width } = element.getBoundingClientRect();
          return { x, width };
        };
        return { header: box(nav), logo: box(nav.querySelector('[aria-label="Dojo.foo home"]')!), action: box(nav.querySelector("a.ui-button")!) };
      }));
    }
    expect(positions[1]).toEqual(positions[0]);
    expect(positions[2]).toEqual(positions[0]);
  }
  const quote = page.locator("[data-site-footer] q");
  expect(await quote.evaluate(q => {
    const mark = q.querySelector("svg")!.getBoundingClientRect();
    const range = document.createRange();
    range.setStart(q.lastChild!, 0);
    range.setEnd(q.lastChild!, 1);
    const text = range.getBoundingClientRect();
    return mark.right <= text.left && mark.top >= text.top && mark.bottom <= text.bottom;
  })).toBe(true);
});

test("catalog filters, sort menu and empty state retain their layout outside the app shell", async ({ page }) => {
  await page.goto("/dojos");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.getByRole("searchbox", { name: "Search courses" }).fill("no-matching-course-for-layout-check");
  const empty = page.locator(".ui-as-empty");
  await expect(empty).toHaveCSS("display", "flex");
  await expect(empty).toHaveCSS("flex-direction", "column");
  await expect(empty).toHaveCSS("border-top-style", "dashed");
  await expect(empty.locator(".ui-as-empty__icon")).toHaveCSS("width", "42px");
  await expect(empty.getByText("No courses found", { exact: true })).toBeVisible();
  await expect(empty.getByRole("button", { name: "Clear filters", exact: true })).toHaveCSS("margin-top", "18px");
  const sort = page.getByRole("button", { name: /^Sort courses:/ });
  await expect(sort).toHaveCSS("display", "flex");
  await sort.click();
  const menu = page.getByRole("menu");
  await expect(menu).toHaveCSS("display", "grid");
  await expect(menu.getByRole("menuitemradio", { name: "Newest" })).toHaveCSS("min-height", "32px");
  await menu.getByRole("menuitemradio", { name: "Newest" }).click();
  await expect(menu).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sort).toHaveCSS("width", "42px");
  await expect.poll(() => page.getByRole("complementary", { name: "Filters" }).evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(180);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("API examples use themed editor frames, tabs and highlighted code without Monaco", async ({ page }) => {
  const editors: string[] = [];
  page.on("request", request => { if (/monaco|editor-worker|editor-core/i.test(request.url())) editors.push(request.url()); });
  await page.goto("/docs/api/list-courses");
  const api = page.locator(".ui-api-reference");
  const request = api.locator("[data-api-request] .ui-cw");
  await expect(request).toHaveCSS("display", "flex");
  await expect(request).toHaveCSS("flex-direction", "column");
  await expect(api.locator(".ui-ed__tabs").first()).toHaveCSS("height", "40px");
  await expect(api.locator(".ui-api-operation")).toHaveCSS("gap", "32px");
  await expect(api.locator(".ui-ed__scheme").first()).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(api.locator('.ui-cw-code .line span[style*="color"]').first()).toBeVisible();
  await expect(api.getByRole("tab", { name: "cURL", exact: true })).toBeVisible();
  await expect(api.getByRole("tab", { name: "200", exact: true })).toBeVisible();
  await expect(api.getByRole("button", { name: "Copy code" }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(api.locator("pre").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(editors).toEqual([]);
});
