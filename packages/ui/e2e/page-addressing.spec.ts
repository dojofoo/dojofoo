import type { Page } from "@playwright/test";
import { draft, expect, savedReply, startConversation, test, workspaceId, type MountedAgentChat } from "./agent-chat.fixture";

test.setTimeout(90_000);

const learner = "agent-workspace";
const lessons = [{ name: "first", title: "First lesson", summary: "Try it", state: "ongoing", isCurrent: true },
  { name: "second", title: "Second lesson", summary: "Another example", state: "ongoing", isCurrent: false }];
const first = { dojo: "agent-course", kata: "first", title: "First lesson", briefing: "# First lesson\nTry a small example.",
  code: "export const answer = 42;\n", starterCode: "export const answer = 0;\n", fileId: "solution", filePath: "first.ts", language: "typescript",
  introduced: true, checkpointed: false, state: "ongoing", isCurrent: true, fragments: {}, lessons,
  // Its checks pass, so "Open next lesson" shows (D25's fallback)
  result: { passed: 1, failed: 0, total: 1, complete: true, tests: [] } };
const second = { ...first, kata: "second", title: "Second lesson", filePath: "second.ts", result: null,
  lessons: lessons.map(lesson => ({ ...lesson, isCurrent: lesson.name === "second" })) };
const kata = { id: "agent-course", title: "Agent course", workspaceId: learner, runId: "learn-run", mode: "katas", kata: "first",
  description: "", version: "1.0.0", language: "TypeScript", tags: [], lessons: ["first", "second"] };
const starter = { id: "create-your-own-dojo", title: "Create your own dojo", workspaceId: learner, runId: "dojo-run", mode: "interactive", kata: null,
  description: "", version: "0.0.3", language: "Other", tags: [], lessons: [] };

/** A learner workspace with an installed kata course and an installed starter course; the routes not mocked here answer 404 */
async function learnerPages(page: Page, mountAgentChat: (page: Page, options?: object) => Promise<MountedAgentChat>) {
  const mounted = await mountAgentChat(page, { persona: "sensei", workspaceId: learner, files: false, existingSession: false });
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/v1/") || path === "/api/control/launch-token" || path === "/api/local/setup") return route.fallback();
    if (path === "/api/control/courses") return route.fulfill({ json: [kata, starter].map(course => ({ workspaceId: learner, runId: course.runId, dojo: course.id,
      title: course.title, kata: course.kata, mode: course.mode, language: course.language, workspaceName: "Learning", selected: course === kata, sessions: [], lastSeenAt: 1 })) });
    if (path === "/api/control/courses/agent-course") return route.fulfill({ json: kata });
    if (path === "/api/control/courses/create-your-own-dojo") return route.fulfill({ json: starter });
    if (path === "/api/control/learning-sessions/learn-run") return route.fulfill({ json: kata });
    if (path === "/api/control/learning-sessions/dojo-run") return route.fulfill({ json: starter });
    if (path.startsWith("/api/control/learning-sessions/")) return route.fulfill({ status: 404, json: { error: "This learning session does not exist." } });
    if (path === "/api/control/authoring" || path === "/api/control/starters") return route.fulfill({ json: [] });
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/diagnostics")) return route.fulfill({ json: [] });
    if (path.endsWith("/completions")) return route.fulfill({ json: { from: 0, options: [] } });
    if (request.method() === "POST" && path.endsWith("/lessons/first/progressions")) return route.fulfill({ json: second });
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: first });
    if (path.endsWith("/lessons/second")) return route.fulfill({ json: second });
    return route.fulfill({ status: 404, json: { error: "Not in this spec" } });
  });
  return mounted;
}

test("CUJ 4: a stale link to another agent's conversation opens the selected agent's, with no error", async ({ page, mountAgentChat, eve }) => {
  const mounted = await mountAgentChat(page, { agent: "claude", existingSession: false });
  const old = await startConversation(eve, mounted.runtime, "Started on OpenCode", "opencode");
  const current = await startConversation(eve, mounted.runtime, "Started on Claude Code", "claude");
  await page.goto(`/authoring/${workspaceId}?session=${old.id}`);
  await expect(page.getByText("Echo: Started on Claude Code", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => { const url = new URL(page.url()); return `${url.pathname}${url.search}`; }).toBe(`/authoring/${workspaceId}`);
  await expect(page.getByText("Echo: Started on OpenCode", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText(/can't be continued/)).toHaveCount(0);
  // The stale link's conversation is still there, live, on its own agent
  await page.getByRole("button", { name: "Conversations", exact: true }).click();
  const row = page.getByRole("list", { name: "Conversations", exact: true }).getByRole("listitem").filter({ hasText: "OpenCode" });
  await expect(row).toContainText("live");
  expect(mounted.runtime.records.map(record => record.id)).toEqual([old.id, current.id]);
});

test("every course link reaches /learn/$runId", async ({ page, mountAgentChat }) => {
  await learnerPages(page, mountAgentChat);
  // The dashboard card
  await page.goto("/");
  await page.getByRole("link", { name: "Agent course", exact: true }).click();
  await expect(page).toHaveURL(/\/learn\/learn-run$/u);
  // The command palette's course entry
  await page.goto("/");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Search your courses", exact: true });
  await palette.getByRole("combobox").fill("Agent course");
  await palette.getByRole("option").filter({ hasText: "Agent course" }).click();
  await expect(page).toHaveURL(/\/learn\/learn-run$/u);
  // An installed course's own page
  await page.goto("/course/agent-course");
  await expect(page).toHaveURL(/\/learn\/learn-run$/u);
  // Explore's Continue
  await page.goto("/explore");
  await page.getByRole("button", { name: "Continue Create your own dojo", exact: true }).click();
  await expect(page).toHaveURL(/\/learn\/dojo-run$/u);
  // "Open next lesson" keeps the page's run and names the lesson
  await page.goto("/learn/learn-run");
  await page.getByRole("button", { name: "Open next lesson", exact: true }).click();
  await expect(page).toHaveURL(/\/learn\/learn-run\/second$/u);
  await expect(page.getByRole("tab", { name: /second\.ts/u })).toBeVisible();
});

test("old learning addresses redirect: a run to /learn, anything else to the dashboard", async ({ page, mountAgentChat }) => {
  await learnerPages(page, mountAgentChat);
  await page.goto("/session/learn-run");
  await expect(page).toHaveURL(/\/learn\/learn-run$/u);
  await page.goto("/learn/learn-run?lesson=second");
  await expect(page).toHaveURL(/\/learn\/learn-run\/second$/u);
  for (const address of ["/session/not-a-run", "/learn/not-a-run", "/course/trial-workspace/trial-course/lesson/first"]) {
    await page.goto(address);
    await expect(page, address).toHaveURL(/\/$/u);
    await expect(page.getByRole("main", { name: "Something went wrong", exact: true })).toHaveCount(0);
  }
});

test("old authoring addresses redirect to /authoring/$draftId or the dashboard", async ({ page, mountAgentChat }) => {
  const { sessionId } = await mountAgentChat(page);
  let drafts = [{ workspaceId, path: draft.root, name: draft.name, description: draft.description, mode: "katas", sessionId: null, lastSeenAt: 1 }];
  await page.route("**/api/control/authoring", route => route.fulfill({ json: drafts }));
  await page.goto(`/authoring?workspace=${workspaceId}&session=${sessionId}`);
  await expect(page).toHaveURL(new RegExp(`/authoring/${workspaceId}\\?session=${sessionId}$`, "u"));
  await expect(page.getByText(savedReply, { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.goto(`/authoring?session=${sessionId}`);
  await expect(page).toHaveURL(/\/$/u);
  // Bare /authoring opens the launch folder's draft (GET /api/authoring/draft's root among the drafts), else the dashboard
  await page.goto("/authoring");
  await expect(page).toHaveURL(new RegExp(`/authoring/${workspaceId}$`, "u"));
  drafts = [];
  await page.goto("/authoring");
  await expect(page).toHaveURL(/\/$/u);
});

test("the authoring page takes its workspace from the path", async ({ page, mountAgentChat }) => {
  await mountAgentChat(page);
  const sockets: string[] = [];
  await page.routeWebSocket("**/api/authoring/changes*", socket => { sockets.push(socket.url()); });
  const draftReads = page.waitForRequest(request => new URL(request.url()).pathname === "/api/authoring/draft");
  await page.goto(`/authoring/${workspaceId}`);
  const read = await draftReads;
  expect(new URL(read.url()).searchParams.get("workspace")).toBe(workspaceId);
  expect(await read.headerValue("x-dojofoo-workspace")).toBe(workspaceId);
  await expect.poll(() => sockets.map(url => new URL(url).searchParams.get("workspace"))).toContain(workspaceId);
  await expect(page.getByText(savedReply, { exact: true })).toBeVisible({ timeout: 10_000 });
});
