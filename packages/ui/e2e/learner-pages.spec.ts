import { expect, test } from "@playwright/test";

test("New course retries failed creation and reopens the accepted native session from the dashboard", async ({ page }) => {
  const pending = Promise.withResolvers<void>();
  const names: string[] = [];
  let created = false;
  let starts = 0;
  const draft = { workspaceId: "created-draft", name: "New course", description: "", mode: "katas", lastSeenAt: 1, sessionId: null };
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/control/courses") return route.fulfill({ json: [] });
    if (url.pathname === "/api/control/authoring" && route.request().method() === "POST") {
      names.push(route.request().postDataJSON().name);
      if (names.length === 1) { await pending.promise; return route.fulfill({ status: 500, json: { error: "Draft disk is full" } }); }
      created = true;
      return route.fulfill({ status: 201, json: draft });
    }
    if (url.pathname === "/api/control/authoring") return route.fulfill({ json: created ? [draft] : [] });
    if (url.pathname.startsWith("/api/authoring/")) expect(url.searchParams.get("workspace")).toBe("created-draft");
    if (url.pathname.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (url.pathname.endsWith("/draft")) return route.fulfill({ json: { root: "/draft", style: "katas", name: "New course", description: "", language: "", manifestSource: "name: New course\n", courseGuidance: "", rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: "name: New course\n" }], lessons: [], issues: [], courseChecks: [] } });
    if (url.pathname.endsWith("/sessions/start")) { starts += 1; return route.fulfill({ status: 201, json: { sessionId: "wrun_created" } }); }
    if (url.pathname.endsWith("/sessions/wrun_created")) return route.fulfill({ json: { session: { sessionId: "wrun_created" }, messages: [] } });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/");
  const button = page.getByRole("button", { name: /^New course/ });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole("button", { name: /^Creating course/ })).toBeDisabled();
  pending.resolve();
  await expect(page.getByRole("alert")).toContainText("Draft disk is full");
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(/\/authoring\?workspace=created-draft&session=wrun_created/);
  await expect(page.getByRole("tab", { name: "dojo.yaml", exact: true })).toBeVisible();
  expect(starts).toBe(1);
  await page.getByRole("link", { name: "Dojo dashboard", exact: true }).click();
  const entry = page.getByRole("region", { name: "Authoring", exact: true }).getByRole("link", { name: /New course/i });
  await expect(entry).toHaveAttribute("href", /session=wrun_created/);
  await entry.click();
  await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeEnabled();
  expect(starts).toBe(1);
  expect(names).toEqual(["New course", "New course"]);
});

test("Explore stays local and both starter shells remain available without an installation or agent session", async ({ page }) => {
  const writes: string[] = [];
  const popups: string[] = [];
  page.on("popup", popup => { popups.push(popup.url()); void popup.close(); });
  await page.context().route("https://dojo.foo/**", route => route.abort());
  await page.route("**/api/**", route => {
    if (route.request().method() !== "GET") writes.push(route.request().url());
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/control/courses" || path === "/api/control/authoring") return route.fulfill({ json: [] });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/");
  const studying = page.getByRole("region", { name: "Studying", exact: true });
  for (const title of ["Create your own dojo", "How to run a dojo"]) await expect(studying.getByRole("link", { name: title, exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Main menu", exact: true }).getByText("Explore", { exact: true }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Find your next course", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Featuring", exact: true }).getByText("How to run a dojo", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Featuring", exact: true }).getByText("Updated", { exact: true })).toHaveCount(0);
  const directory = page.locator(".lj-directory");
  await directory.getByPlaceholder("Search courses").fill("Create your own");
  await expect(directory.getByRole("button", { name: "Open Create your own dojo", exact: true })).toBeVisible();
  await expect(directory.getByRole("button", { name: "Open How to run a dojo", exact: true })).toHaveCount(0);
  await directory.getByRole("button", { name: "Open Create your own dojo", exact: true }).click();
  await expect(page).toHaveURL(/\/starter\/create-your-own-dojo$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create your own dojo", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox")).toBeDisabled();
  await expect(page.getByRole("navigation", { name: "Main menu", exact: true }).getByText("Courses", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("starter-course-shell.png"), animations: "disabled" });
  await page.getByRole("navigation", { name: "Breadcrumb", exact: true }).getByText("Dashboard", { exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await studying.getByRole("link", { name: "How to run a dojo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "How to run a dojo", exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  expect(popups).toEqual([]);
});

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
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("You", { timeout: 5000 });
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Handle", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Upload photo", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
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

test("the route error keeps its full trace and uses UIX recovery controls on a phone", async ({ page }) => {
  let broken = true;
  await page.route("**/api/control/courses", route => route.fulfill({ json: broken ? {} : [] }));
  await page.route("**/api/control/authoring", route => route.fulfill({ json: [] }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Something went wrong", exact: true })).toBeVisible();
  await expect(page.locator("pre")).toContainText("TypeError:");
  expect((await page.locator("pre").innerText()).split("\n").length).toBeGreaterThan(1);
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toHaveClass(/ui-button/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("local-error-phone.png"), animations: "disabled" });
  broken = false;
  await page.getByRole("link", { name: "Back to courses", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your courses", exact: true })).toBeVisible();
});
