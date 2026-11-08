import { expect, test } from "@playwright/test";

test("the shared website shell retains all five Storybook icon choices", async ({ page }) => {
  const errors: string[] = [];
  const rendered = new Set<string>();
  page.on("pageerror", error => errors.push(error.message));
  for (const icons of ["mingcute", "solar", "fluent", "hugeicons", "iconoir"]) {
    await page.goto(`/iframe.html?id=web-site--landing&viewMode=story&globals=icons:${icons}`);
    const search = page.locator("[data-site-navigation]").getByRole("button", { name: "Search courses", exact: true });
    const svg = search.locator("svg");
    await expect(svg).toHaveCount(1);
    await expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(await svg.locator("path, circle, ellipse, polygon, rect").count()).toBeGreaterThan(0);
    rendered.add(await svg.evaluate(element => element.innerHTML));
  }
  expect(rendered.size).toBe(5);
  expect(errors).toEqual([]);
});
