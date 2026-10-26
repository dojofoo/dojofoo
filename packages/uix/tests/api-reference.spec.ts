import { expect, test } from "@playwright/test";

test("the API reference lists endpoints by collection and keeps an endpoint to its request and examples", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/iframe.html?id=docs-documentation--api-endpoint&viewMode=story");
  await expect(page.getByRole("heading", { name: "List courses", exact: true })).toBeVisible();
  // The sidebar: the collections, each endpoint as its method and path
  const tree = page.getByRole("complementary", { name: "Pages" });
  await expect(tree.getByText("Courses", { exact: true })).toBeVisible();
  await expect(tree.getByRole("link", { name: "GET /health, Check health" })).toBeVisible();
  // No playground, page tools or response schema: the method and path, then cURL and the example responses
  await expect(page.locator(".ui-api-reference").getByRole("button", { name: "Send", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy Markdown" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^Response Body/ })).toHaveCount(0);
  const examples = page.getByRole("complementary", { name: "Request and response examples" });
  await expect(examples.getByRole("tab", { name: "cURL", exact: true })).toBeVisible();
  await expect(examples.getByRole("tab", { name: "JavaScript", exact: true })).toHaveCount(0);
  await expect(examples.getByRole("tab", { name: "200", exact: true })).toBeVisible();
  await expect(page.locator("[data-api-request]")).toContainText("/api/v1/courses");
  const request = page.locator("[data-api-request]");
  const title = await page.getByRole("heading", { name: "List courses", exact: true }).boundingBox();
  const box = await request.boundingBox();
  expect(box!.y - (title!.y + title!.height)).toBeGreaterThanOrEqual(20);
  await expect(page.locator(".ui-api-reference pre.ui-code span[style]").first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("[data-api-request]")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/iframe.html?id=docs-documentation--api-event&viewMode=story");
  await expect(page.getByRole("heading", { name: /^Request Body/ })).toBeVisible();
  await expect(page.locator(".ui-api-reference").first()).toContainText("instanceId");
  // An enum's values listed, and no filter over the body's few fields
  await expect(page.locator(".ui-api-reference").first()).toContainText("kata_completed");
  await expect(page.getByPlaceholder("Filter Properties")).toBeHidden();
  expect(errors).toEqual([]);
});
