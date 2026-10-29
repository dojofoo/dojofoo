import { expect, test } from "@playwright/test";
import { mountAgentChat } from "./agent-chat.fixture";

test("starting a learner session retains workspace choices through failure and retry", async ({ page }) => {
  test.setTimeout(60_000);
  const pending = Promise.withResolvers<void>();
  const accepted = Promise.withResolvers<void>();
  const starts: string[] = [];
  const course = { dojo: "session-course", kata: "first", mode: "katas", language: "TypeScript", lastSeenAt: 1, sessionId: "existing", sessions: [{ lessonId: "first", sessionId: "existing" }] };
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/control/courses") return route.fulfill({ json: [
      { ...course, workspaceId: "alpha", workspaceName: "Alpha", selected: true },
      { ...course, workspaceId: "beta", workspaceName: "Beta" },
    ] });
    if (path === "/api/control/authoring") return route.fulfill({ json: [] });
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    const snapshot = { dojo: "session-course", kata: "first", title: "First lesson", briefing: "Try an example", code: "export const answer = 0;", starterCode: "export const answer = 0;",
      fileId: "solution", filePath: "first.ts", language: "typescript", introduced: true, checkpointed: false, sessionId: "accepted-session", harness: "codex", harnesses: ["codex"], model: null,
      state: "ongoing", isCurrent: true, result: null, fragments: {}, messages: [], lessons: [{ name: "first", title: "First lesson", summary: "Try it", state: "ongoing", isCurrent: true }] };
    if (path.endsWith("/sessions") && request.method() === "POST") {
      starts.push(path);
      if (starts.length === 1) { await pending.promise; return route.fulfill({ status: 503, json: { error: "Coding agent is unavailable" } }); }
      await accepted.promise;
      return route.fulfill({ status: 201, json: snapshot });
    }
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: snapshot });
    if (path.endsWith("/diagnostics")) return route.fulfill({ json: [] });
    if (path.endsWith("/completions")) return route.fulfill({ json: { from: 0, options: [] } });
    return route.fulfill({ status: 404 });
  });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Session Course", exact: true }).click();
    const chooser = page.getByRole("dialog", { name: "Continue Session Course", exact: true });
    await chooser.getByRole("button", { name: /^Course workspace:/ }).click();
    await page.getByRole("menuitemradio", { name: /^Beta/ }).click();
    await chooser.getByRole("button", { name: /^Course session:/ }).click();
    await page.getByRole("menuitemradio", { name: "Start a new session", exact: true }).click();
    await chooser.getByRole("button", { name: "Continue", exact: true }).click();
    pending.resolve();
    await expect(chooser.getByRole("alert")).toContainText("Coding agent is unavailable", { timeout: 5000 });
    await expect(chooser.getByRole("button", { name: /^Course workspace:/ })).toContainText("Beta");
    await expect(chooser.getByRole("button", { name: /^Course session:/ })).toContainText("Start a new session");
    await chooser.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(chooser.getByRole("button", { name: "Opening…", exact: true })).toBeDisabled();
    await expect.poll(() => starts.length).toBe(2);
    const secondRequest = page.waitForEvent("requestfailed", { predicate: request => request.method() === "POST" && new URL(request.url()).pathname.endsWith("/sessions") });
    await chooser.getByRole("button", { name: "Cancel", exact: true }).click();
    await secondRequest;
    await expect(chooser).not.toBeVisible();
    accepted.resolve();
    await page.getByRole("button", { name: "Session Course", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await chooser.getByRole("button", { name: /^Course workspace:/ }).click();
    await page.getByRole("menuitemradio", { name: /^Beta/ }).click();
    await chooser.getByRole("button", { name: /^Course session:/ }).click();
    await page.getByRole("menuitemradio", { name: "Start a new session", exact: true }).click();
    await chooser.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(/\/session\/accepted-session$/);
    await expect(page.locator(".view-lines")).toContainText("export const answer = 0;");
    expect(starts).toEqual(Array(3).fill("/api/workspaces/beta/courses/session-course/lessons/first/sessions"));
  } finally { pending.resolve(); accepted.resolve(); }
});

test("New course retries failed creation and reopens the accepted native session from the dashboard", async ({ page }) => {
  const pending = Promise.withResolvers<void>();
  const names: string[] = [];
  let created = false;
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
    return route.fulfill({ status: 404 });
  });
  const agent = await mountAgentChat(page, { workspaceId: "created-draft", files: false });
  await page.goto("/");
  const button = page.getByRole("button", { name: /^New course/ });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole("button", { name: /^Creating course/ })).toBeDisabled();
  pending.resolve();
  await expect(page.getByRole("alert")).toContainText("Draft disk is full");
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(/\/authoring\?workspace=created-draft&session=session-1/);
  await expect(page.getByRole("tab", { name: "dojo.yaml", exact: true })).toBeVisible();
  expect(agent.calls.filter(call => call === "POST /api/v1/workspaces/created-draft/sessions")).toHaveLength(1);
  await page.getByRole("link", { name: "Dojo dashboard", exact: true }).click();
  const entry = page.getByRole("region", { name: "Authoring", exact: true }).getByRole("link", { name: /New course/i });
  await expect(entry).toHaveAttribute("href", /session=session-1/);
  await entry.click();
  await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeEnabled();
  expect(agent.calls.filter(call => call === "POST /api/v1/workspaces/created-draft/sessions")).toHaveLength(1);
  expect(names).toEqual(["New course", "New course"]);
});

for (const [courseId, title] of [["create-your-own-dojo", "Create your own dojo"], ["how-to-run-a-dojo", "How to run a dojo"]] as const) {
  test(`starter course opens its workspace installation flow: ${courseId}`, async ({ page }) => {
    const installs: unknown[] = [];
    const writes: string[] = [];
    await page.route("**/api/**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() !== "GET") writes.push(path);
      if (path === "/api/control/courses" || path === "/api/control/authoring" || path === "/api/control/starters") return route.fulfill({ json: [] });
      if (path === "/api/control/workspaces") return route.fulfill({ json: [{ id: "starter-workspace", path: "/tmp/starter-workspace" }] });
      if (path === `/api/control/starters/${courseId}/install`) {
        installs.push(request.postDataJSON());
        return route.fulfill({ status: 201, json: { workspaceId: "starter-workspace", courseId } });
      }
      return route.fulfill({ status: 404 });
    });
    await page.goto("/");
    await page.getByRole("region", { name: "Studying", exact: true }).getByRole("link", { name: title, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/explore\\?course=${courseId}$`), { timeout: 5000 });
    await page.reload();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Install course", exact: true })).toBeDisabled();
    expect(writes).toEqual([]);
    await dialog.getByRole("button", { name: /^Course workspace:/ }).click();
    await page.getByRole("menuitemradio", { name: "/tmp/starter-workspace", exact: true }).click();
    await dialog.getByRole("button", { name: "Install course", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/interactive\\?.*course=${courseId}`));
    expect(installs).toEqual([{ workspaceId: "starter-workspace" }]);
    expect(writes).toEqual([`/api/control/starters/${courseId}/install`]);
  });
}

test("the account menu opens local Settings and Profile through the Pages layout", async ({ page }) => {
  await page.route("**/api/control/courses", route => route.fulfill({ json: [] }));
  await page.route("**/api/control/authoring", route => route.fulfill({ json: [] }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "You", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "You", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Profile", exact: true })).toBeVisible();
  // No accounts locally: the menu ends at the theme row
  await expect(page.getByRole("menuitem", { name: "Log in", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Log out", exact: true })).toHaveCount(0);
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


test("Explore installs a starter in the chosen workspace and retains the choice after failure", async ({ page }) => {
  test.setTimeout(30_000);
  const writes: unknown[] = [];
  let installed = false;
  await page.route("**/api/workspaces/beta/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/conversation")) return route.fulfill({ json: { sessionId: null, messages: [], model: null } });
    if (path.endsWith("/interactive")) return route.fulfill({ json: {
      dojo: "create-your-own-dojo", title: "Create your own dojo", lessonTitle: "First lesson", step: 0, totalSteps: 1, complete: false, response: null,
      current: { id: "first", type: "present", title: "Choose an audience", content: "Choose who you want to teach.", contentBase: null },
    } });
    return route.fulfill({ status: 404 });
  });
  await page.route("**/api/control/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/workspaces")) return route.fulfill({ json: [{ id: "alpha", path: "/Alpha" }, { id: "beta", path: "/Beta" }] });
    if (path.endsWith("/starters")) return route.fulfill({ json: installed ? [{ workspaceId: "beta", courseId: "create-your-own-dojo" }] : [] });
    if (path.endsWith("/install")) {
      writes.push(route.request().postDataJSON());
      if (writes.length === 1) return route.fulfill({ status: 500, json: { error: "Installation unavailable; your files are unchanged." } });
      installed = true;
      return route.fulfill({ status: 201, json: { workspaceId: "beta", courseId: "create-your-own-dojo" } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/explore");
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Install Create your own dojo", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Install course", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: /^Course workspace:/ }).click();
  await page.getByRole("menuitemradio", { name: "/Beta", exact: true }).click();
  await dialog.getByRole("button", { name: "Install course", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Installation unavailable");
  await expect(dialog.getByRole("button", { name: /^Course workspace:/ })).toContainText("/Beta");
  expect(writes).toEqual([{ workspaceId: "beta" }]);
  await dialog.getByRole("button", { name: "Install course", exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes).toEqual([{ workspaceId: "beta" }, { workspaceId: "beta" }]);
  await expect(page).toHaveURL(/interactive\?workspace=beta&course=create-your-own-dojo/);
  await expect(page.getByRole("heading", { name: "Choose an audience", exact: true })).toBeVisible();
  await page.goto("/explore");
  await page.getByRole("button", { name: "Open Create your own dojo", exact: true }).click();
  await page.getByRole("button", { name: /^Course workspace:/ }).click();
  await page.getByRole("menuitemradio", { name: "/Beta", exact: true }).click();
  await page.getByRole("button", { name: "Open course", exact: true }).click();
  await expect(page).toHaveURL(/interactive\?workspace=beta&course=create-your-own-dojo/);
  expect(writes).toHaveLength(2);
});
