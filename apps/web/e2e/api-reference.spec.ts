import { expect, test } from "@playwright/test";

test("API docs hydrate from the generated Elysia spec, list endpoints by collection and keep examples on phones", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const response = await page.request.get("/api/v1/openapi/json");
  expect(response.status()).toBe(200);
  expect((await response.json()).paths["/api/v1/courses"].get.operationId).toBe("listCourses");
  await page.goto("/docs/api/list-courses", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "List courses", exact: true })).toBeVisible();
  // The sidebar: each endpoint as its method and path
  await expect(page.getByRole("link", { name: /^GET\s*\/health$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^POST\s*\/events$/ })).toBeVisible();
  const api = page.locator(".ui-api-reference");
  // No playground and no response schema: the method and path, the parameters, and the examples on the right
  await expect(api.getByRole("button", { name: "Send", exact: true })).toHaveCount(0);
  await expect(api.getByRole("heading", { name: /^Response Body/ })).toHaveCount(0);
  const examples = api.getByRole("complementary", { name: "Request and response examples" });
  await expect(examples.getByRole("tab", { name: "cURL", exact: true })).toBeVisible();
  await expect(examples.getByRole("tab", { name: "JavaScript", exact: true })).toHaveCount(0);
  await expect(examples.getByRole("tab", { name: "200", exact: true })).toBeVisible();
  await expect(examples).toContainText("curl -X GET");
  await page.goto("/docs/api/list-course-profiles");
  await expect(page.getByRole("heading", { name: "List course profiles", exact: true })).toBeVisible();
  const request = page.locator("[data-api-request]");
  await expect(request).toContainText("/api/v1/course-profiles");
  await expect.poll(async () => {
    const title = await page.getByRole("heading", { name: "List course profiles", exact: true }).boundingBox();
    const box = await request.boundingBox();
    return title && box ? box.y - (title.y + title.height) : -1;
  }).toBeGreaterThanOrEqual(20);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(api.locator("pre.ui-code").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
