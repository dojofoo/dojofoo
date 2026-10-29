import { expect, test } from "@playwright/test";

test("legacy briefing links use the UIX lesson presentation through loading, content and error states", async ({ page }) => {
  const ready = Promise.withResolvers<void>();
  const requests: string[] = [];
  const writes: string[] = [];
  const source = "### Goal\nRead **one example**.\n\n```typescript\nconst answer = 42;\n```";
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET" && path !== "/api/teaching/preview") writes.push(path);
    if (path.endsWith("/katas/example/briefing")) {
      requests.push(path);
      await ready.promise;
      return route.fulfill({ json: { name: "example", path: "example/SENSEI.md", markdown: source } });
    }
    if (path.endsWith("/katas/missing/briefing")) return route.fulfill({ status: 404, json: { error: "Kata not found: missing" } });
    if (path.endsWith("/katas/empty/briefing")) return route.fulfill({ json: { name: "empty", path: "empty/SENSEI.md", markdown: "" } });
    if (path === "/api/teaching/preview") {
      expect(route.request().postDataJSON()).toMatchObject({ source });
      return route.fulfill({ json: { blocks: [{ type: "html", html: '<h3>Goal</h3><p>Read <strong>one example</strong>.</p><pre class="shiki"><code><span style="color: #ff0077">const</span> answer = 42;</code></pre>' }] } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/kata/example");
  await expect(page.locator(".ui-as-app")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("loading…");
  ready.resolve();
  await expect(page.locator(".ui-lb")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Goal", exact: true })).toBeVisible();
  await expect(page.locator(".teaching-markdown strong")).toHaveText("one example");
  await expect(page.locator("pre.shiki code")).toContainText("const answer = 42;");
  await expect(page.getByRole("navigation", { name: "Main menu", exact: true }).getByText("Courses", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "You", exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("kata-briefing-desktop.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("kata-briefing-phone.png"), animations: "disabled" });
  await page.getByRole("navigation", { name: "Breadcrumb", exact: true }).getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your courses", exact: true })).toBeVisible();
  await page.goto("/kata/missing");
  await expect(page.getByRole("alert")).toHaveText("Kata not found: missing");
  await expect(page.locator(".ui-as-app")).toBeVisible();
  await page.goto("/kata/empty");
  await expect(page.getByRole("status")).toHaveText("No briefing for this kata.");
  expect(requests).toEqual(["/api/project/katas/example/briefing"]);
  expect(writes).toEqual([]);
});
