import type { Page } from "@playwright/test";
import { Client } from "@dojofoo/agent/client";
import type { SessionRecord } from "@dojofoo/agent-api";
import type { startEve } from "@dojofoo/agent-api/fixtures";
import { agentIds, agentRow, offeredAgents } from "@dojofoo/protocol";
import { expect, greetingReply, startConversation, test, workspaceId, type MountedAgentChat } from "./agent-chat.fixture";

test.setTimeout(90_000);

type Eve = Awaited<ReturnType<typeof startEve>>;
// Which agents are offered comes from the shipped conformance record: one besides Claude Code and Codex, and one not offered at all
const away = offeredAgents().find(row => row.id !== "claude" && row.id !== "codex")!;
const notOffered = agentRow(agentIds.find(id => !offeredAgents().some(row => row.id === id))!);

/** The history menu next to the persona's dot, opened, and its rows */
async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Conversations", exact: true }).click();
  return page.getByRole("list", { name: "Conversations", exact: true }).getByRole("listitem");
}
/** A conversation that ended in Eve; its stream stays readable */
async function endedConversation(eve: Eve, runtime: MountedAgentChat["runtime"], message: string, agent: string) {
  const record = await startConversation(eve, runtime, message, agent);
  await new Client({ baseUrl: eve.baseUrl }).sessions.attach(record.id).end();
  record.endedAt = "2026-11-03T00:00:00.000Z";
  return record;
}
/** Every visible alert offers its way out (D33) */
async function alertsHaveActions(page: Page) {
  for (const alert of await page.getByRole("alert").filter({ visible: true }).all()) await expect(alert.getByRole("button").first()).toBeVisible();
}

test("CUJ 5: a pick on another agent asks to switch, then opens that conversation on it", async ({ page, mountAgentChat, eve }) => {
  const mounted = await mountAgentChat(page, { agent: "claude", existingSession: false });
  const { runtime, sent } = mounted;
  await startConversation(eve, runtime, "First on Claude Code", "claude");
  const newest = await startConversation(eve, runtime, "Newest on Claude Code", "claude");
  newest.createdAt = "2026-10-29T00:00:00Z";
  const elsewhere = await startConversation(eve, runtime, "Outline the course elsewhere", away.id);
  elsewhere.firstMessage = "Outline the course elsewhere";
  await page.goto(`/authoring/${workspaceId}`);
  await expect(page.getByText("Echo: Newest on Claude Code", { exact: true })).toBeVisible({ timeout: 10_000 });
  const rows = await openMenu(page);
  await expect(rows).toHaveCount(3);
  await rows.filter({ hasText: "Outline the course elsewhere" }).getByRole("button").click();
  const dialog = page.getByRole("dialog", { name: `Switch this workspace to ${away.name}?` });
  await expect(dialog).toContainText(`Kyoshi will use ${away.name} for this draft.`);
  await dialog.getByRole("button", { name: "Switch", exact: true }).click();
  await expect.poll(() => runtime.selections).toEqual([away.id]);
  await expect(page.getByText("Echo: Outline the course elsewhere", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(new RegExp(`/authoring/${workspaceId}\\?session=${elsewhere.id}$`, "u"));
  const input = page.getByTestId("authoring-chat-composer").getByRole("textbox");
  await expect(input).toBeEnabled({ timeout: 10_000 });
  await input.fill("Keep going");
  await input.press("Enter");
  await expect.poll(() => sent.map(item => item.sessionId)).toEqual([elsewhere.id]);
  await expect(page.getByText("Echo: Keep going", { exact: true })).toBeVisible({ timeout: 10_000 });
  expect(runtime.records).toHaveLength(3);
});

test("cancelling a pick's switch leaves the agent and the open conversation as they were", async ({ page, mountAgentChat, eve }) => {
  const { runtime } = await mountAgentChat(page, { agent: "claude", existingSession: false });
  await startConversation(eve, runtime, "Open on Claude Code", "claude");
  await startConversation(eve, runtime, "Waiting elsewhere", away.id);
  await page.goto(`/authoring/${workspaceId}`);
  await expect(page.getByText("Echo: Open on Claude Code", { exact: true })).toBeVisible({ timeout: 10_000 });
  await (await openMenu(page)).filter({ hasText: away.name }).getByRole("button").click();
  const dialog = page.getByRole("dialog", { name: `Switch this workspace to ${away.name}?` });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(runtime.selections).toEqual([]);
  await expect(page.getByText("Echo: Open on Claude Code", { exact: true })).toBeVisible();
  await expect(page.getByText("Echo: Waiting elsewhere", { exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("session")).toBe(false);
});

test("an ended Kyoshi conversation opens read-only and continues in a new conversation", async ({ page, mountAgentChat, eve }) => {
  const { runtime } = await mountAgentChat(page, { agent: "claude", existingSession: false });
  const ended = await endedConversation(eve, runtime, "An ended outline", "claude");
  ended.firstMessage = "An ended outline";
  await startConversation(eve, runtime, "The live outline", "claude");
  await page.goto(`/authoring/${workspaceId}`);
  await expect(page.getByText("Echo: The live outline", { exact: true })).toBeVisible({ timeout: 10_000 });
  const row = (await openMenu(page)).filter({ hasText: "An ended outline" });
  await expect(row).toContainText("ended");
  await row.getByRole("button").click();
  await expect(page.getByText("Echo: An ended outline", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("This conversation has ended.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeDisabled();
  expect(new URL(page.url()).searchParams.has("session")).toBe(false);
  expect(runtime.records).toHaveLength(2);
  expect(runtime.records.find(record => record.id === ended.id)).not.toHaveProperty("replacedBy");
  await page.getByRole("button", { name: "Continue in a new conversation", exact: true }).click();
  await expect.poll(() => runtime.records.length).toBe(3);
  await expect(page.getByText(greetingReply, { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeEnabled();
  expect(new URL(page.url()).searchParams.has("session")).toBe(false);
  expect(runtime.records.find(record => record.id === ended.id)).not.toHaveProperty("replacedBy");
});

const learner = "agent-workspace";
const lessons = [{ name: "first", title: "First lesson", summary: "Try it", state: "ongoing", isCurrent: true }];
const snapshot = { dojo: "agent-course", kata: "first", title: "First lesson", briefing: "# First lesson\nTry a small example.",
  code: "export const answer = 0;\n", starterCode: "export const answer = 0;\n", fileId: "solution", filePath: "first.ts", language: "typescript",
  introduced: true, checkpointed: false, state: "ongoing", isCurrent: true, result: null, fragments: {}, lessons };
const models = { data: [{ id: "deepseek/model", name: "DeepSeek", efforts: [] }, { id: "openai/model", name: "GPT", efforts: [] }], pagination: { hasMore: false } };

/** A kata lesson's page (the rewritten learner-agent-picker.spec.ts's mocks) with Sensei's conversations on the lesson */
async function senseiLesson(page: Page, eve: Eve, mountAgentChat: (page: Page, options?: object) => Promise<MountedAgentChat>,
  conversations: Array<{ message: string; agent?: string; createdAt: string; ended?: boolean } & Partial<SessionRecord>>) {
  const mounted = await mountAgentChat(page, { persona: "sensei", workspaceId: learner, files: false, existingSession: false });
  const records: SessionRecord[] = [];
  for (const { message, agent = "codex", ended, ...fields } of conversations) {
    const record = ended ? await endedConversation(eve, mounted.runtime, message, agent) : await startConversation(eve, mounted.runtime, message, agent);
    Object.assign(record, { persona: "sensei", courseId: "agent-course", lessonId: "first", firstMessage: message, ...fields });
    records.push(record);
  }
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (/^\/api\/v1\/workspaces\/[^/]+\/agents\/[^/]+\/models$/u.test(path)) return route.fulfill({ json: models });
    if (path.startsWith("/api/v1/") || path === "/api/control/launch-token" || path === "/api/local/setup") return route.fallback();
    if (path === "/api/control/courses") return route.fulfill({ json: [{ workspaceId: learner, runId: "learn-run", dojo: "agent-course", title: "Agent course", kata: "first", mode: "katas",
      workspaceName: "Learning", selected: true, sessions: [] }] });
    if (path === "/api/control/learning-sessions/learn-run") return route.fulfill({ json: { id: "agent-course", title: "Agent course", workspaceId: learner, runId: "learn-run",
      mode: "katas", kata: "first", description: "", version: "1.0.0", language: "TypeScript", tags: [], lessons: ["first"] } });
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/diagnostics")) return route.fulfill({ json: [] });
    if (path.endsWith("/completions")) return route.fulfill({ json: { from: 0, options: [] } });
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: snapshot });
    return route.fulfill({ status: 404, json: { error: "Not in this spec" } });
  });
  return { ...mounted, records };
}

test("Sensei's ended and replaced conversations can't be opened; a live one on another agent offers the switch", async ({ page, mountAgentChat, eve }) => {
  await senseiLesson(page, eve, mountAgentChat, [
    { message: "The live lesson", createdAt: "2026-10-29T00:00:00Z" },
    { message: "An ended lesson", ended: true, createdAt: "2026-10-28T00:00:00Z" },
    { message: "A replaced lesson", ended: true, replacedBy: "another", createdAt: "2026-10-27T00:00:00Z" },
    { message: "Live elsewhere", agent: away.id, createdAt: "2026-10-26T00:00:00Z" },
  ]);
  await page.goto("/learn/learn-run?lesson=first");
  await expect(page.getByText("Echo: The live lesson", { exact: true })).toBeVisible({ timeout: 15_000 });
  const rows = await openMenu(page);
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: "An ended lesson" })).toContainText("ended");
  await expect(rows.filter({ hasText: "An ended lesson" }).getByRole("button")).toHaveCount(0);
  await expect(rows.filter({ hasText: "A replaced lesson" })).toContainText("replaced");
  await expect(rows.filter({ hasText: "A replaced lesson" }).getByRole("button")).toHaveCount(0);
  await rows.filter({ hasText: "Live elsewhere" }).getByRole("button").click();
  const dialog = page.getByRole("dialog", { name: `Switch this workspace to ${away.name}?` });
  await expect(dialog).toContainText(`Sensei will use ${away.name} for every lesson in this workspace.`);
  await expect(dialog).toContainText(`The conversation continues if it still can; otherwise a new conversation starts on ${away.name}.`);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("a conversation on an agent that isn't offered is listed without an action", async ({ page, mountAgentChat, eve }) => {
  await senseiLesson(page, eve, mountAgentChat, [
    { message: "The live lesson", createdAt: "2026-10-29T00:00:00Z" },
    { message: "On an agent no longer offered", agent: notOffered.id, createdAt: "2026-10-28T00:00:00Z" },
  ]);
  await page.goto("/learn/learn-run?lesson=first");
  await expect(page.getByText("Echo: The live lesson", { exact: true })).toBeVisible({ timeout: 15_000 });
  const row = (await openMenu(page)).filter({ hasText: "On an agent no longer offered" });
  await expect(row).toContainText(`${notOffered.name} isn't available`);
  await expect(row.getByRole("button")).toHaveCount(0);
});

test("a picked Sensei conversation on the selected agent opens with its own model", async ({ page, mountAgentChat, eve }) => {
  const { records } = await senseiLesson(page, eve, mountAgentChat, [
    { message: "The live lesson", createdAt: "2026-10-29T00:00:00Z", model: "deepseek/model" },
    { message: "An earlier lesson", createdAt: "2026-10-28T00:00:00Z", model: "openai/model" },
  ]);
  await page.goto("/learn/learn-run?lesson=first");
  await expect(page.getByText("Echo: The live lesson", { exact: true })).toBeVisible({ timeout: 15_000 });
  await (await openMenu(page)).filter({ hasText: "An earlier lesson" }).getByRole("button").click();
  await expect(page.getByText("Echo: An earlier lesson", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(`/learn/learn-run\\?lesson=first&session=${records[1]!.id}$`, "u"));
  const composer = page.getByTestId("authoring-chat-composer");
  await composer.getByRole("button", { name: "Model", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: /^GPT/ })).toBeChecked({ timeout: 5000 });
  await page.keyboard.press("Escape");
});

test("no bare error: a failed list read offers Try again, and a picked conversation that can't continue opens the default", async ({ page, mountAgentChat, eve }) => {
  const { records } = await senseiLesson(page, eve, mountAgentChat, [
    { message: "The live lesson", createdAt: "2026-10-29T00:00:00Z" },
    { message: "A stranded lesson", createdAt: "2026-10-28T00:00:00Z" },
  ]);
  const stranded = records[1]!;
  let failures = 1;
  await page.route("**/api/v1/workspaces/*/sessions?*", route => failures-- > 0
    ? route.fulfill({ status: 503, json: { error: "temporarily_unavailable", message: "Conversations temporarily unavailable" } }) : route.fallback());
  await page.route(`**/sessions/${stranded.id}/eve/v1/session/${stranded.id}/stream*`, route => route.fulfill({
    status: 409, json: { error: "This session was built by an earlier eve.", code: "session_stranded" },
  }));
  await page.goto("/learn/learn-run?lesson=first");
  await expect(page.getByText("Echo: The live lesson", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Conversations", exact: true }).click();
  const failure = page.getByRole("alert").filter({ hasText: "Couldn't load the conversations." });
  await expect(failure).toBeVisible();
  await alertsHaveActions(page);
  await failure.getByRole("button", { name: "Try again", exact: true }).click();
  const rows = page.getByRole("list", { name: "Conversations", exact: true }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await rows.filter({ hasText: "A stranded lesson" }).getByRole("button").click();
  await expect(page.getByRole("status").filter({ hasText: "That conversation can't be continued, so the newest one on Codex opened instead." })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Echo: The live lesson", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/learn\/learn-run\?lesson=first$/u);
  await alertsHaveActions(page);
});
