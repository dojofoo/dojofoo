import { expect, test } from "./agent-chat.fixture";

for (const mode of ["authoring", "learner", "interactive"] as const) test(`${mode} account menu opens /settings and /me, and settings go back to the workspace`, async ({ page, mountAgentChat }) => {
  const initial = mode === "authoring" ? "name: Settings course\n" : "export const answer = 0;\n";
  const messages = [{ id: "saved-guidance", role: "assistant", parts: [{ type: "text", content: "Your saved guidance" }] }];
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [{ type: "html", html: "<p>One focused outcome.</p>" }] } });
    if (path.endsWith("/files/solution/diagnostics")) return route.fulfill({ json: [] });
    if (path.endsWith("/files/solution/completions")) {
      expect(request.postDataJSON()).toMatchObject({ filePath: "first.ts" });
      return route.fulfill({ json: { from: 0, options: [] } });
    }
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: { root: "/tmp/settings-course", style: "katas", name: "Settings course", description: "One focused outcome", language: "TypeScript",
      manifestSource: initial, courseGuidance: "", rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: initial }], lessons: [], issues: [], courseChecks: [] } });
    if (path === "/api/control/courses") return route.fulfill({ json: [{ workspaceId: "settings-workspace", dojo: "settings-course", kata: "first", mode: "katas", workspaceName: "Settings", selected: true, sessionId: "saved", sessions: [{ lessonId: "first", sessionId: "saved" }] }] });
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: { dojo: "settings-course", kata: "first", title: "First lesson", briefing: "One focused outcome", code: initial, starterCode: initial,
      fileId: "solution", filePath: "first.ts", language: "typescript", introduced: true, checkpointed: false, sessionId: "saved", harness: "codex", harnesses: ["codex"], model: null,
      state: "ongoing", isCurrent: true, result: null, fragments: {}, messages, lessons: [{ name: "first", title: "First lesson", summary: "One focused outcome", state: "ongoing", isCurrent: true }] } });
    if (path.endsWith("/conversation")) return route.fulfill({ json: { sessionId: "saved", harness: "codex", harnesses: ["codex"], model: null, messages } });
    if (path.endsWith("/interactive")) return route.fulfill({ json: { dojo: "settings-course", title: "Settings course", lessonTitle: "First lesson", step: 0, totalSteps: 1, complete: false, response: null,
      current: { id: "first", type: "present", title: "First step", content: "One focused outcome", contentBase: null } } });
    return route.fulfill({ status: 404 });
  });
  const agent = mode === "authoring" ? await mountAgentChat(page, { root: "/tmp/settings-course", files: false }) : undefined;
  const url = agent ? `/authoring/ws-1?session=${agent.sessionId}` : mode === "learner"
    ? "/course/settings-workspace/settings-course/lesson/first" : "/interactive?workspace=settings-workspace&course=settings-course";
  await page.goto(url);
  const input = page.getByRole("textbox", { name: mode === "interactive" ? "Message the sensei" : "Code editor", exact: true });
  await expect(input).toBeEnabled();
  const workspaceUrl = page.url();
  // Settings is its own page, on Theme
  await page.getByRole("button", { name: "You", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/theme$/u);
  const settings = page.getByRole("region", { name: "Account settings", exact: true });
  await expect(settings.getByRole("tab", { name: "Theme", exact: true })).toHaveAttribute("aria-selected", "true");
  await settings.getByRole("radio", { name: "Japan Blues", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "japan-blues");
  // Profile is a section of its own
  await settings.getByRole("tab", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/u);
  await expect(settings.getByRole("textbox", { name: "Name", exact: true })).toBeDisabled();
  await expect(settings.getByRole("tab", { name: "API keys", exact: true })).toHaveCount(0);
  // Back goes to the page that opened settings
  await settings.getByRole("button", { name: "Back to workspace", exact: true }).click();
  await expect(page).toHaveURL(workspaceUrl);
  await expect(input).toBeEnabled();
  // Profile in the menu opens the learner's own page
  await page.getByRole("button", { name: "You", exact: true }).click();
  await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL(/\/me$/u);
  await expect(page.getByRole("heading", { name: "You", level: 1, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Courses", exact: true })).toBeVisible();
});
