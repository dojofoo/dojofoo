import { testLaunchToken } from "@dojofoo/harness/api/fixtures";
import { expect, greetingReply, savedReply, test, workspaceId } from "./agent-chat.fixture";
import type { Page } from "@playwright/test";

async function pickAgent(page: Page, name: string) {
  const composer = page.getByTestId("authoring-chat-composer");
  const menu = composer.getByRole("button", { name: "Agent", exact: true });
  await expect(menu).toBeEnabled({ timeout: 10_000 });
  await menu.click();
  await page.getByRole("menuitemradio", { name }).click();
}

test("switching the draft's agent asks first, then Kyoshi's next conversation runs on the new agent", async ({ page, mountAgentChat }) => {
  test.setTimeout(60_000);
  const { runtime, selects, sessionId } = await mountAgentChat(page);
  await page.goto(`/authoring/${workspaceId}?session=${sessionId}`);
  const agent = page.getByTestId("authoring-chat-composer").getByRole("button", { name: "Agent", exact: true });
  await expect(page.getByText(savedReply, { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(agent).toContainText("Codex");

  await pickAgent(page, "OpenCode");
  const dialog = page.getByRole("dialog", { name: "Switch this workspace to OpenCode?" });
  await expect(dialog).toContainText("Kyoshi will use OpenCode for this draft.");
  await dialog.getByRole("button", { name: "Switch", exact: true }).click();

  await expect.poll(() => selects).toEqual([{ agentId: "opencode", token: testLaunchToken }]);
  await expect.poll(() => runtime.records.find(record => record.agent === "opencode")?.id, { timeout: 10_000 }).toEqual(expect.any(String));
  await expect(agent).toContainText("OpenCode");
  await expect(page.getByText(greetingReply, { exact: true })).toBeVisible({ timeout: 10_000 });
  // The new agent's conversation is the page's default: its id is never written into the URL (D30)
  expect(new URL(page.url()).searchParams.has("session")).toBe(false);
});

test("the agent menu lists the offered agents, the selected one first, and not Cursor until it has a passing record", async ({ page, mountAgentChat }) => {
  test.setTimeout(60_000);
  const { sessionId } = await mountAgentChat(page);
  await page.goto(`/authoring/${workspaceId}?session=${sessionId}`);
  await expect(page.getByText(savedReply, { exact: true })).toBeVisible({ timeout: 10_000 });
  const menu = page.getByTestId("authoring-chat-composer").getByRole("button", { name: "Agent", exact: true });
  await expect(menu).toBeEnabled({ timeout: 10_000 });
  await menu.click();
  const items = page.getByRole("menuitemradio");
  const offered = ["Codex", "Claude Code", "Grok Build", "OpenCode", "FX", "Pi"];
  await expect(items).toHaveCount(offered.length);
  for (const [index, name] of offered.entries()) await expect(items.nth(index)).toHaveAccessibleName(name);
});

test("cancelling the switch keeps the agent and the conversation", async ({ page, mountAgentChat }) => {
  test.setTimeout(60_000);
  const { selects, sessionId } = await mountAgentChat(page);
  await page.goto(`/authoring/${workspaceId}?session=${sessionId}`);
  await expect(page.getByText(savedReply, { exact: true })).toBeVisible({ timeout: 10_000 });
  await pickAgent(page, "OpenCode");
  const dialog = page.getByRole("dialog", { name: "Switch this workspace to OpenCode?" });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(selects).toEqual([]);
  await expect(page.getByTestId("authoring-chat-composer").getByRole("button", { name: "Agent", exact: true })).toContainText("Codex");
  await expect(page).toHaveURL(new RegExp(`session=${sessionId}(?:&|$)`));
  await expect(page.getByText(savedReply, { exact: true })).toBeVisible();
});

test("a lesson opened after a switch runs on the new agent", async ({ page, mountAgentChat }) => {
  test.setTimeout(60_000);
  const learner = "ws-learn";
  const { runtime, selects } = await mountAgentChat(page, { persona: "sensei", workspaceId: learner, files: false, existingSession: false });
  const current = async () => (await runtime.agents(learner)).find(agent => agent.selected)!.id;
  const lessons = [{ name: "first", title: "First lesson", summary: "Start here", state: "ongoing", isCurrent: true }, { name: "second", title: "Second lesson", summary: "Review another example", state: "completed", isCurrent: false }];
  const snapshot = async (kata: "first" | "second") => ({ dojo: "agent-course", course: { name: "Agent course", title: "Agent course", version: "1.0.0", lessons: 2 },
    kata, title: kata === "first" ? "First lesson" : "Second lesson", briefing: "Try a small example.", code: "export const answer = 0;\n", starterCode: "export const answer = 0;\n",
    fileId: "solution", filePath: `${kata}.ts`, language: "typescript", introduced: true, checkpointed: false, model: null,
    harness: await current(), state: kata === "first" ? "ongoing" : "completed", isCurrent: kata === "first",
    result: null, fragments: {}, lessons });
  const lessonReads: string[] = [];
  const bodies: string[] = [];
  page.on("request", request => { const body = request.postData(); if (body) bodies.push(body); });
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/v1/") || path === "/api/control/launch-token" || path === "/api/local/setup") return route.fallback();
    if (path === "/api/control/learning-sessions/learn-run") {
      return route.fulfill({ json: { id: "agent-course", title: "Agent course", workspaceId: learner, runId: "learn-run", mode: "katas", kata: "first",
        description: "", version: "1.0.0", language: "TypeScript", tags: [], lessons: ["first", "second"] } });
    }
    if (path === "/api/control/courses") {
      return route.fulfill({ json: [{ workspaceId: learner, runId: "learn-run", dojo: "agent-course", title: "Agent course", kata: "first", mode: "katas", workspaceName: "Learning", selected: true, sessions: [] }] });
    }
    const lesson = /\/lessons\/(first|second)$/u.exec(path);
    if (lesson) {
      lessonReads.push(`${lesson[1]}:${await current()}`);
      return route.fulfill({ json: await snapshot(lesson[1] as "first" | "second") });
    }
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/diagnostics")) return route.fulfill({ json: [] });
    if (path.endsWith("/completions")) return route.fulfill({ json: { from: 0, options: [] } });
    return route.fulfill({ status: 404, json: { error: "Not in this spec" } });
  });

  await page.goto("/learn/learn-run");
  // The kata page's conversation is the fixture runtime's, on AgentChat
  const composer = page.getByTestId("authoring-chat-composer");
  const agent = composer.getByRole("button", { name: "Agent", exact: true });
  await expect(agent).toContainText("Codex", { timeout: 10_000 });
  await expect(agent).toBeEnabled({ timeout: 10_000 });
  await agent.click();
  await page.getByRole("menuitemradio", { name: "OpenCode" }).click();
  const dialog = page.getByRole("dialog", { name: "Switch this workspace to OpenCode?" });
  await expect(dialog).toContainText("Sensei will use OpenCode for every lesson in this workspace.");
  await dialog.getByRole("button", { name: "Switch", exact: true }).click();

  await expect.poll(() => selects.map(select => select.agentId)).toEqual(["opencode"]);
  await expect.poll(() => lessonReads).toContain("first:opencode");
  await expect(agent).toContainText("OpenCode");

  await page.getByRole("button", { name: /^Second lesson \(done\)/u }).click();
  await expect.poll(() => lessonReads).toContain("second:opencode");
  await expect(page.getByTestId("authoring-chat-composer").getByRole("button", { name: "Agent", exact: true })).toContainText("OpenCode");
  expect(bodies.filter(body => body.includes("harness"))).toEqual([]);
});

test("a refused launch token is fetched once more and the switch succeeds", async ({ page, mountAgentChat }) => {
  test.setTimeout(60_000);
  const launch = { served: ["stale", "fresh"], accepted: "stale" };
  const { selects, tokenReads, sessionId } = await mountAgentChat(page, { launch });
  await page.goto(`/authoring/${workspaceId}?session=${sessionId}`);
  await expect(page.getByText(savedReply, { exact: true })).toBeVisible({ timeout: 10_000 });
  // The conversation opened with the page's token (POST /sessions/default takes it too); the UI server then relaunches
  launch.accepted = "fresh";
  await pickAgent(page, "OpenCode");
  await page.getByRole("dialog").getByRole("button", { name: "Switch", exact: true }).click();
  await expect(page.getByTestId("authoring-chat-composer").getByRole("button", { name: "Agent", exact: true })).toContainText("OpenCode", { timeout: 10_000 });
  expect(tokenReads).toEqual(["stale", "fresh"]);
  expect(selects).toEqual([{ agentId: "opencode", token: "stale" }, { agentId: "opencode", token: "fresh" }]);
});

test("a launch token refused twice asks to reload the page", async ({ page, mountAgentChat }) => {
  test.setTimeout(60_000);
  const launch = { served: ["stale"], accepted: "stale" };
  const { selects, sessionId } = await mountAgentChat(page, { launch });
  await page.goto(`/authoring/${workspaceId}?session=${sessionId}`);
  await expect(page.getByText(savedReply, { exact: true })).toBeVisible({ timeout: 10_000 });
  launch.accepted = testLaunchToken;
  await pickAgent(page, "OpenCode");
  await page.getByRole("dialog").getByRole("button", { name: "Switch", exact: true }).click();
  const alert = page.getByRole("alert").filter({ hasText: "This page is out of date." });
  await expect(alert).toBeVisible({ timeout: 10_000 });
  await expect(alert.getByRole("button", { name: "Reload the page", exact: true })).toBeVisible();
  expect(selects).toHaveLength(2);
  await expect(page.getByTestId("authoring-chat-composer").getByRole("button", { name: "Agent", exact: true })).toContainText("Codex");
  await expect(page).toHaveURL(new RegExp(`session=${sessionId}(?:&|$)`));
});
