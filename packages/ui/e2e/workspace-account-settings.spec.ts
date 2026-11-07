import type { Page } from "@playwright/test";
import { expect, test, type MountedAgentChat } from "./agent-chat.fixture";

const learner = "account-learner";
const lessons = [{ name: "first", title: "First lesson", summary: "Try it", state: "ongoing", isCurrent: true }];
const first = { dojo: "agent-course", kata: "first", title: "First lesson", briefing: "# First lesson\nTry a small example.",
  code: "export const answer = 0;\n", starterCode: "export const answer = 0;\n", fileId: "solution", filePath: "first.ts", language: "typescript",
  introduced: true, checkpointed: false, state: "ongoing", isCurrent: true, fragments: {}, lessons, result: null };
const kata = { id: "agent-course", title: "Agent course", workspaceId: learner, runId: "learn-run", mode: "katas", kata: "first",
  description: "", version: "1.0.0", language: "TypeScript", tags: [], lessons: ["first"] };
const draft = { root: "/tmp/settings-course", style: "katas", name: "Settings course", description: "One focused outcome", language: "TypeScript",
  manifestSource: "name: Settings course\n", courseGuidance: "", rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: "name: Settings course\n" }],
  lessons: [], issues: [], courseChecks: [] };

/** The page's API: the agent runtime, the launch token and the local setup come from the server under test */
async function pageApi(page: Page) {
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/v1/") || path === "/api/control/launch-token" || path === "/api/local/setup") return route.fallback();
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/diagnostics")) return route.fulfill({ json: [] });
    if (path.endsWith("/completions")) return route.fulfill({ json: { from: 0, options: [] } });
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    if (path === "/api/control/courses") return route.fulfill({ json: [{ workspaceId: learner, runId: "learn-run", dojo: "agent-course", title: "Agent course",
      kata: "first", mode: "katas", language: "TypeScript", workspaceName: "Learning", selected: true, sessions: [], lastSeenAt: 1 }] });
    if (path === "/api/control/authoring") return route.fulfill({ json: [] });
    if (path === "/api/control/learning-sessions/learn-run") return route.fulfill({ json: kata });
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: first });
    return route.fulfill({ status: 404, json: { error: "Not in this spec" } });
  });
}

type Mount = (page: Page, options?: object) => Promise<MountedAgentChat>;
const pages: Record<string, { mount: (page: Page, mountAgentChat: Mount) => Promise<MountedAgentChat>; url: (mounted: MountedAgentChat) => string }> = {
  authoring: { mount: (page, mountAgentChat) => mountAgentChat(page, { root: draft.root, files: false }), url: mounted => `/authoring/ws-1?session=${mounted.sessionId}` },
  learner: { mount: (page, mountAgentChat) => mountAgentChat(page, { persona: "sensei", workspaceId: learner, files: false, existingSession: false }), url: () => "/learn/learn-run/first" },
};

for (const [name, { mount, url }] of Object.entries(pages)) test(`from the ${name} page, Settings and Profile are pages of their own and Back to workspace returns`, async ({ page, mountAgentChat }) => {
  const mounted = await mount(page, mountAgentChat);
  await pageApi(page);
  await page.goto(url(mounted));
  const editor = page.getByRole("textbox", { name: "Code editor", exact: true });
  await expect(editor).toBeVisible();
  const workspaceUrl = page.url();
  const account = page.getByRole("button", { name: "Anonymous", exact: true });
  // Settings opens on Theme
  await account.click();
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
  // Back to workspace returns past both sections to the page that opened settings
  await settings.getByRole("button", { name: "Back to workspace", exact: true }).click();
  await expect(page).toHaveURL(workspaceUrl);
  await expect(editor).toBeVisible();
  // Profile in the menu opens the learner's own page
  await account.click();
  await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL(/\/me$/u);
  await expect(page.getByRole("heading", { name: "Anonymous", level: 1, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Courses", exact: true })).toContainText("Agent course");
});
