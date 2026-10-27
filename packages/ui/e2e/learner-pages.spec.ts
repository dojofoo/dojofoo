import { expect, test } from "@playwright/test";

test("the account menu opens local Settings and Profile through the Pages layout", async ({ page }) => {
  await page.route("**/api/control/courses", route => route.fulfill({ json: [] }));
  await page.route("**/api/control/authoring", route => route.fulfill({ json: [] }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "You", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "You", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Profile", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Log in", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Log out", exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Dark mode", exact: true })).toBeVisible();
  await page.getByRole("switch", { name: "Dark mode", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("switch", { name: "Dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "You", exact: true }).click();
  await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\?tab=General/);
  await expect(page.getByText("Profile settings are coming soon.", { exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "About General", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "API keys", exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("local-profile-settings.png"), animations: "disabled" });
});

test("the learner sidebar uses the Pages course card and Dashboard breadcrumb", async ({ page }) => {
  const writes: string[] = [];
  await page.route("**/api/workspaces/pages-course/**", route => {
    if (route.request().method() !== "GET") writes.push(route.request().url());
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/interactive/conversation")) return route.fulfill({ json: { sessionId: null, messages: [], model: null } });
    if (path.endsWith("/interactive")) return route.fulfill({ json: {
      dojo: "learner", title: "Learner course", lessonTitle: "First lesson", step: 0, totalSteps: 1, complete: false, response: null,
      course: { name: "Learner course", version: "1.2.3", description: "A course about learning", author: "Course author", language: "TypeScript", lessons: 1 },
      current: { id: "first", type: "present", title: "First step", content: "Read and think.", contentBase: null },
    } });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/interactive?workspace=pages-course&course=learner");
  const navigation = page.getByRole("navigation", { name: "Main menu", exact: true });
  await expect(page.getByRole("heading", { name: "First step", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "You", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "You", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(navigation.getByRole("link", { name: "Courses", exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("button", { name: "Courses", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Breadcrumb", exact: true }).getByText("Dashboard", { exact: true })).toBeVisible();
  const card = page.locator(".lj-course .ui-course");
  await expect(card).toContainText("1.2.3");
  await expect(card).toContainText("Course author");
  await card.getByRole("button", { name: /show details$/ }).click();
  await expect(card.getByText("Language", { exact: true })).toBeVisible();
  await expect(card.getByText("TypeScript", { exact: true })).toBeVisible();
  await expect(card.getByText("Version", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: /show the front$/ }).click();
  await expect(card.getByText("1.2.3", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "You", exact: true })).toBeInViewport({ ratio: 1 });
  expect(writes).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("learner-course-card.png"), animations: "disabled" });
});
