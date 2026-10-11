import { expect, test } from "@playwright/test";

test("a direct trial route loads the browser modules without starting a harness", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/control/courses", route => route.fulfill({ json: [] }));
  await page.goto("/course/import-check/starter-kata/lesson/001-example");
  await expect(page.getByText("Course not found.", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await page.reload();
  await expect(page.getByText("Course not found.", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
