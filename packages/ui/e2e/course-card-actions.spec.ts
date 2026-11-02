import { expect, test } from "@playwright/test";

test("dashboard cards represent courses, keep sessions together, and delete through their menus", async ({ page }) => {
  const deleted: string[] = [];
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "DELETE") { deleted.push(path); return route.fulfill({ status: 204 }); }
    if (path === "/api/local/setup") return route.fulfill({ json: { completed: true, user: { name: "Anonymous" }, agents: ["codex"] } });
    if (path === "/api/control/courses") return route.fulfill({ json: [{ dojo: "one-course", title: "One course", runId: "one-run", language: "TypeScript", description: "Keep learning", lastSeenAt: 1, sessions: [{ sessionId: "first" }, { sessionId: "second" }] }] });
    if (path === "/api/control/authoring") return route.fulfill({ json: [{ workspaceId: "draft-one", name: "My draft", mode: "katas", path: "/tmp/my-draft" }] });
    return route.fulfill({ json: {} });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your courses", exact: true })).toBeVisible();
  const studying = page.getByRole("region", { name: "Studying", exact: true });
  await expect(studying.locator("a.ui-card")).toHaveCount(1);
  await studying.getByRole("button", { name: "Actions for One course", exact: true }).click();
  await expect(page).toHaveURL("/");
  await page.screenshot({ path: test.info().outputPath("course-card-menu.png"), animations: "disabled" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(studying.locator("a.ui-card")).toHaveCount(0);
  const authoring = page.getByRole("region", { name: "Authoring", exact: true });
  await authoring.getByRole("button", { name: "Actions for My draft", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(authoring.locator("a.ui-card")).toHaveCount(0);
  expect(deleted).toEqual(["/api/control/courses/one-course", "/api/control/authoring/draft-one"]);
  await page.screenshot({ path: test.info().outputPath("course-card-actions.png"), animations: "disabled" });
});
