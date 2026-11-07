import { expect, test } from "./agent-chat.fixture";

test("New course retries failed creation and reopens the accepted native session from the dashboard", async ({ page, mountAgentChat }) => {
  const pending = Promise.withResolvers<void>();
  const names: string[] = [];
  let created = false;
  const draft = { workspaceId: "created-draft", name: "New course", description: "", mode: "katas", lastSeenAt: 1, sessionId: null };
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/**", async route => {
    if (new URL(route.request().url()).pathname === "/api/local/setup") return route.fallback();
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
    return route.fulfill({ status: 404 });
  });
  const agent = await mountAgentChat(page, { workspaceId: "created-draft", files: false, existingSession: false });
  await page.goto("/");
  const button = page.getByRole("button", { name: /^New course/ });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole("button", { name: /^Creating course/ })).toBeDisabled();
  pending.resolve();
  await expect(page.getByRole("alert")).toContainText("Draft disk is full");
  await expect(button).toBeEnabled();
  await button.click();
  await expect.poll(() => agent.runtime.records.length).toBe(1);
  await expect(page).toHaveURL(/\/authoring\/created-draft$/u);
  await expect(page.getByRole("tab", { name: "dojo.yaml", exact: true })).toBeVisible();
  await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeEnabled();
  await expect(page).toHaveURL(/\/authoring\/created-draft$/u);
  expect(agent.runtime.records).toHaveLength(1);
  await page.getByRole("link", { name: "Dojo dashboard", exact: true }).click();
  const entry = page.getByRole("region", { name: "Authoring", exact: true }).getByRole("link", { name: /New course/i });
  await expect(entry).toHaveAttribute("href", "/authoring/created-draft");
  await entry.click();
  await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeEnabled();
  // The same conversation opens again: still one record
  expect(agent.runtime.records).toHaveLength(1);
  expect(names).toEqual(["New course", "New course"]);
});

for (const [courseId, title] of [["create-your-own-dojo", "Create your own dojo"], ["how-to-run-a-dojo", "How to run a dojo"]] as const) {
  test(`starter course opens its installation flow: ${courseId}`, async ({ page }) => {
    const installs: unknown[] = [];
    const writes: string[] = [];
    let installed = false;
    const course = { id: courseId, title, workspaceId: "starter-workspace", runId: "starter-run", mode: "interactive", kata: null,
      description: "", version: "0.0.3", language: "Other", tags: [], lessons: [] };
    await page.route("**/api/**", async route => {
      if (new URL(route.request().url()).pathname === "/api/local/setup") return route.fallback();
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() !== "GET") writes.push(path);
      if (path === "/api/control/courses" || path === "/api/control/authoring" || path === "/api/control/starters") return route.fulfill({ json: [] });
      if (path === `/api/control/courses/${courseId}`) return installed ? route.fulfill({ json: course }) : route.fulfill({ status: 404, json: { error: "Course not installed" } });
      // The installed run's page: an id that is not a run would land on the dashboard (D33)
      if (path === "/api/control/learning-sessions/starter-run") return installed ? route.fulfill({ json: course }) : route.fulfill({ status: 404, json: { error: "This learning session does not exist." } });
      if (path === `/api/control/starters/${courseId}/install`) {
        installs.push(request.postDataJSON());
        installed = true;
        return route.fulfill({ status: 201, json: { workspaceId: "starter-workspace", courseId } });
      }
      return route.fulfill({ status: 404 });
    });
    await page.goto("/");
    await page.getByRole("region", { name: "Studying", exact: true }).getByRole("button", { name: "Explore courses", exact: true }).click();
    await page.getByRole("button", { name: `Details ${title}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/course/${courseId}$`), { timeout: 5000 });
    await page.reload();
    await expect(page.getByRole("button", { name: "Install course", exact: true })).toBeEnabled();
    expect(writes).toEqual([]);
    await page.getByRole("button", { name: "Install course", exact: true }).click();
    await expect(page).toHaveURL(/\/learn\/starter-run$/);
    expect(installs).toEqual([{}]);
    expect(writes).toEqual([`/api/control/starters/${courseId}/install`]);
  });
}

test("the account menu opens local Settings and Profile through the Pages layout", async ({ page }) => {
  await page.route("**/api/control/courses", route => route.fulfill({ json: [] }));
  await page.route("**/api/control/authoring", route => route.fulfill({ json: [] }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Anonymous", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Anonymous", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Profile", exact: true })).toBeVisible();
  // No accounts locally: the menu ends at the theme row
  await expect(page.getByRole("menuitem", { name: "Log in", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Log out", exact: true })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Dark mode", exact: true })).toBeVisible();
  await page.getByRole("switch", { name: "Dark mode", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("switch", { name: "Dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Anonymous", exact: true }).click();
  // Profile opens the learner's own page; its Edit profile opens the profile settings
  await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByRole("heading", { name: "Anonymous", level: 1, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Anonymous", { timeout: 5000 });
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Handle", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Upload photo", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  await expect(page.getByRole("complementary", { name: "About Profile", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "API keys", exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("local-profile-settings.png"), animations: "disabled" });
});

test("the learner sidebar uses the Pages course card and Dashboard breadcrumb", async ({ page }) => {
  const writes: string[] = [];
  await page.route("**/api/workspaces/pages-course/**", route => {
    if (route.request().method() !== "GET") writes.push(route.request().url());
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/interactive")) return route.fulfill({ json: {
      dojo: "learner", title: "Learner course", lessonTitle: "First lesson", step: 0, totalSteps: 1, complete: false, response: null,
      lessonId: "first", lessonIndex: 0, completedLessons: 0, lessons: [{ id: "first", title: "First lesson", state: "active" }], slides: [], unlockedStep: 0, references: [],
      course: { name: "Learner course", version: "1.2.3", description: "A course about learning", author: "Course author", language: "TypeScript", lessons: 1 },
      current: { id: "first", type: "present", title: "First step", content: "Read and think.", contentBase: null },
    } });
    return route.fulfill({ status: 404 });
  });
  const course = { id: "learner", title: "Learner course", workspaceId: "pages-course", runId: "learner-run", mode: "interactive", kata: null,
    description: "A course about learning", version: "1.2.3", author: "Course author", language: "TypeScript", tags: [], lessons: ["first"] };
  await page.route(/\/api\/control\/(?:courses\/learner|learning-sessions\/learner-run)$/, route => route.fulfill({ json: course }));
  await page.goto("/interactive?workspace=pages-course&course=learner");
  const navigation = page.getByRole("navigation", { name: "Main menu", exact: true });
  await expect(page.getByRole("heading", { name: "First step", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Anonymous", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Anonymous", exact: true })).toBeInViewport({ ratio: 1 });
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
  await expect(page.getByRole("button", { name: "Anonymous", exact: true })).toBeInViewport({ ratio: 1 });
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


test("Explore installs a starter and retries after a failed installation", async ({ page }) => {
  test.setTimeout(30_000);
  const writes: unknown[] = [];
  let installed = false;
  const course = { id: "create-your-own-dojo", title: "Create your own dojo", workspaceId: "beta", runId: "beta-run", mode: "interactive", kata: null,
    description: "", version: "0.0.3", language: "Other", tags: [], lessons: ["first"] };
  await page.route("**/api/workspaces/beta/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/conversation")) return route.fulfill({ json: { sessionId: null, messages: [], model: null } });
    if (path.endsWith("/interactive")) return route.fulfill({ json: {
      dojo: "create-your-own-dojo", title: "Create your own dojo", lessonTitle: "First lesson", step: 0, totalSteps: 1, complete: false, response: null,
      lessonId: "first", lessonIndex: 0, completedLessons: 0, lessons: [{ id: "first", title: "First lesson", state: "active" }], slides: [], unlockedStep: 0, references: [],
      current: { id: "first", type: "present", title: "Choose an audience", content: "Choose who you want to teach.", contentBase: null },
    } });
    return route.fulfill({ status: 404 });
  });
  await page.route("**/api/control/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/control/courses") return route.fulfill({ json: installed ? [{ dojo: course.id, runId: course.runId }] : [] });
    if (path === `/api/control/courses/${course.id}` || path === `/api/control/learning-sessions/${course.runId}`) {
      return installed ? route.fulfill({ json: course }) : route.fulfill({ status: 404, json: { error: "Course not installed" } });
    }
    if (path.endsWith("/install")) {
      writes.push(route.request().postDataJSON());
      if (writes.length === 1) return route.fulfill({ status: 500, json: { error: "Installation unavailable; your files are unchanged." } });
      installed = true;
      return route.fulfill({ status: 201, json: { workspaceId: "beta", courseId: course.id } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/explore");
  await page.getByRole("button", { name: "Details Create your own dojo", exact: true }).click();
  expect(writes).toEqual([]);
  const install = page.getByRole("button", { name: "Install course", exact: true });
  await install.click();
  await expect(page.getByRole("alert")).toContainText("Installation unavailable");
  expect(writes).toEqual([{}]);
  await install.click();
  await expect(page).toHaveURL(/\/learn\/beta-run$/);
  await expect(page.getByRole("heading", { name: "Choose an audience", exact: true })).toBeVisible();
  expect(writes).toEqual([{}, {}]);
  await page.goto("/explore");
  await page.getByRole("button", { name: "Continue Create your own dojo", exact: true }).click();
  await expect(page).toHaveURL(/\/learn\/beta-run$/);
  expect(writes).toHaveLength(2);
});
