import { Client } from "@dojofoo/harness/client";
import { draft, expect, greetingReply, savedMessage, savedReply, test, workspaceId, type MountedAgentChat } from "./agent-chat.fixture";

/** Conversations the page created: the records besides the saved one */
const created = ({ runtime, sessionId }: Pick<MountedAgentChat, "runtime" | "sessionId">) => runtime.records.filter(record => record.id !== sessionId).length;
/** The page never writes its default conversation's id into the URL (D30) */
const noSessionInUrl = (page: import("@playwright/test").Page) => expect.poll(() => new URL(page.url()).searchParams.has("session")).toBe(false);

test("opening authoring without a session URL resumes its saved workspace conversation", async ({ page, mountAgentChat }) => {
  test.setTimeout(30_000);
  const mounted = await mountAgentChat(page);
  await page.goto(`/authoring/${workspaceId}`);
  await expect(page.getByText(savedReply, { exact: true })).toBeVisible({ timeout: 4000 });
  await noSessionInUrl(page);
  expect(created(mounted)).toBe(0);
});

test("a failed saved-conversation lookup can retry without creating another conversation", async ({ page, mountAgentChat }) => {
  test.setTimeout(30_000);
  const mounted = await mountAgentChat(page);
  let unavailable = true;
  await page.route("**/api/v1/**/sessions/default", route => unavailable
    ? route.fulfill({ status: 503, json: { error: "temporarily_unavailable", message: "Saved conversations temporarily unavailable" } })
    : route.fallback());
  await page.goto(`/authoring/${workspaceId}`);
  await expect(page.getByRole("alert").filter({ hasText: "Saved conversations temporarily unavailable" })).toBeVisible({ timeout: 4000 });
  expect(created(mounted)).toBe(0);
  unavailable = false;
  await page.getByRole("button", { name: "Reload conversation", exact: true }).click();
  await expect(page.getByText(savedReply, { exact: true })).toBeVisible({ timeout: 4000 });
  await noSessionInUrl(page);
  expect(created(mounted)).toBe(0);
});

test("the same conversation follows the open lesson and file without saving unsent editor changes", async ({ page, mountAgentChat }) => {
  test.setTimeout(40_000);
  const saves: string[] = [];
  page.on("request", request => { if (request.method() === "PUT" && request.url().includes("/api/authoring/files/")) saves.push(request.url()); });
  const mounted = await mountAgentChat(page, { draft: { ...draft, lessons: [{
    id: "first", title: "First lesson", description: "An introduction", senseiPath: "src/first/SENSEI.md",
    sensei: "# Teaching notes", hasSensei: true, evalPaths: [], checks: [],
    files: [{ path: "src/first/SENSEI.md", label: "SENSEI.md", content: "# Teaching notes" }],
  }] } });
  const { sent, sessionId } = mounted;
  await page.goto(`/authoring/${workspaceId}?session=${sessionId}`);
  await expect(page.getByText(savedReply, { exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Main menu" });
  await navigation.getByRole("treeitem", { name: "SENSEI.md", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Code editor", exact: true });
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("# Unsaved teaching notes");
  await expect(page.getByRole("tab", { name: /^SENSEI\.md/ })).toHaveAccessibleName(/unsaved changes/);
  const composer = page.getByTestId("authoring-chat-composer");
  await composer.getByRole("textbox").fill("Explain this file");
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => sent.at(-1)?.body.clientContext).toEqual({ workspaceId, view: {
    scope: "lesson", lessonId: "first", file: "src/first/SENSEI.md", unsavedChanges: true,
  } });
  await expect(page.getByText("Echo: Explain this file", { exact: true })).toBeVisible();
  await expect(composer.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  await navigation.getByRole("treeitem", { name: "dojo.yaml", exact: true }).click();
  await composer.getByRole("textbox").fill("Now explain the course manifest");
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => sent.at(-1)?.body.clientContext).toEqual({ workspaceId, view: { scope: "course", file: "dojo.yaml", unsavedChanges: false } });
  await expect(page.getByText("Echo: Now explain the course manifest", { exact: true })).toBeVisible();
  expect(sent.map(item => item.sessionId)).toEqual([sessionId, sessionId]);
  expect(created(mounted)).toBe(0);
  expect(saves).toHaveLength(0);
});

test("authoring restores history and sends a file without text through the session's Eve routes", async ({ page, mountAgentChat }) => {
  test.setTimeout(30_000);
  const mounted = await mountAgentChat(page);
  const { sent, calls, sessionId } = mounted;
  await page.goto(`/authoring/${workspaceId}?session=${sessionId}`);
  await expect(page.getByText(savedMessage, { exact: true })).toBeVisible({ timeout: 4000 });
  await expect(page.getByText(savedReply, { exact: true })).toBeVisible();
  const composer = page.getByTestId("authoring-chat-composer");
  await expect(composer.getByRole("button", { name: "Agent", exact: true })).toContainText("Codex");
  await composer.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Course notes") });
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("I received your notes.", { exact: true })).toBeVisible({ timeout: 10_000 });
  expect(sent).toHaveLength(1);
  expect(JSON.stringify(sent[0]!.body)).toContain("data:text/plain;base64,Q291cnNlIG5vdGVz");
  expect(JSON.stringify(sent[0]!.body)).toContain("notes.txt");
  expect(calls).toContain(`POST /api/v1/workspaces/${workspaceId}/sessions/${sessionId}/eve/v1/session/${sessionId}`);
  expect(created(mounted)).toBe(0);
});

test("an accepted conversation survives a failed history read and retries without another start", async ({ page, mountAgentChat }) => {
  test.setTimeout(30_000);
  let failRead = false;
  const { runtime } = await mountAgentChat(page, { existingSession: false, failRead: () => failRead });
  await page.goto(`/authoring/${workspaceId}`);
  await expect.poll(() => runtime.records.length).toBe(1);
  await expect(page.getByText(greetingReply, { exact: true })).toBeVisible({ timeout: 10_000 });
  await noSessionInUrl(page);
  // A reload reads the page's conversation again
  failRead = true;
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "Conversation temporarily unavailable" })).toBeVisible({ timeout: 4000 });
  await expect(page.getByRole("textbox", { name: "Code editor", exact: true })).toBeVisible();
  failRead = false;
  await page.getByRole("button", { name: "Reload conversation", exact: true }).click();
  await expect(page.getByText(greetingReply, { exact: true })).toBeVisible({ timeout: 10_000 });
  expect(runtime.records).toHaveLength(1);
});

test("new authoring opens its files and conversation without calling the retired backend discovery route", async ({ page, mountAgentChat }) => {
  test.setTimeout(30_000);
  const { runtime } = await mountAgentChat(page, { existingSession: false });
  let discoveries = 0;
  await page.route("**/api/authoring/backend*", route => {
    discoveries++;
    return route.fulfill({ json: { backend: "eve" } });
  });
  await page.goto(`/authoring/${workspaceId}`);
  await expect(page.getByRole("tab", { name: "dojo.yaml", exact: true })).toBeVisible({ timeout: 4000 });
  await expect.poll(() => runtime.records.length).toBe(1);
  await expect(page.getByText(greetingReply, { exact: true })).toBeVisible({ timeout: 10_000 });
  await noSessionInUrl(page);
  expect(discoveries).toBe(0);
});

test("conversation reload preserves an unsent note and attachment through a failed retry", async ({ page, mountAgentChat }) => {
  test.setTimeout(30_000);
  let failRead = false;
  const mounted = await mountAgentChat(page, { failRead: () => failRead, failRun: () => true });
  const { sessionId } = mounted;
  await page.goto(`/authoring/${workspaceId}?session=${sessionId}`);
  const composer = page.getByTestId("authoring-chat-composer");
  const input = composer.getByRole("textbox");
  await expect(input).toBeEnabled({ timeout: 4000 });
  await input.fill("First note");
  await input.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Could not send this note" })).toBeVisible({ timeout: 4000 });
  await input.fill("Keep my unsent note");
  await composer.locator('input[type="file"]').setInputFiles({ name: "draft.txt", mimeType: "text/plain", buffer: Buffer.from("Unsent draft") });
  failRead = true;
  await page.getByRole("button", { name: "Reload conversation", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Conversation temporarily unavailable" })).toBeVisible({ timeout: 4000 });
  await expect(input).toHaveValue("Keep my unsent note");
  await expect(composer).toContainText("draft.txt");
  failRead = false;
  await page.getByRole("button", { name: "Reload conversation", exact: true }).click();
  await expect(input).toBeEnabled({ timeout: 4000 });
  await expect(input).toHaveValue("Keep my unsent note");
  await expect(composer).toContainText("draft.txt");
  expect(created(mounted)).toBe(0);
});

test("a note during a running turn steers it instead of queueing, and a failed stop can be retried", async ({ page, mountAgentChat }) => {
  test.setTimeout(60_000);
  let cancellations = 0;
  const { sessionId, cancelled, sent } = await mountAgentChat(page, { failCancel: () => cancellations++ === 0 });
  await page.goto(`/authoring/${workspaceId}?session=${sessionId}`);
  const input = page.getByTestId("authoring-chat-composer").getByRole("textbox");
  const pane = page.getByTestId("authoring-chat-pane");
  await expect(input).toBeEnabled({ timeout: 4000 });
  await input.fill("Take a slow look");
  await input.press("Enter");
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  await expect(stop).toBeVisible({ timeout: 4000 });
  // Sent while the slow turn runs, the note redirects it: no queue, and no reply to the slow message
  await input.fill("Another note");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect.poll(() => sent.some(item => JSON.stringify(item.body).includes("Another note"))).toBe(true);
  await expect(page.getByRole("region", { name: "Queued messages", exact: true })).toHaveCount(0);
  await expect(pane.getByText("Echo: Another note", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(pane.getByText("Echo: Take a slow look", { exact: true })).toHaveCount(0);
  await expect(stop).toHaveCount(0);
  await input.fill("One more slow look");
  await input.press("Enter");
  await expect(stop).toBeVisible({ timeout: 4000 });
  await stop.click();
  const failure = page.getByRole("alert").filter({ hasText: "Could not stop the conversation" });
  await expect(failure).toBeVisible();
  await stop.click();
  await expect(stop).toHaveCount(0, { timeout: 15_000 });
  await expect(input).toBeEnabled();
  await expect(failure).toHaveCount(0);
  expect(cancelled).toEqual([sessionId]);
  await expect(pane.getByText("Echo: One more slow look", { exact: true })).toHaveCount(0);
});

test("opening an in-flight conversation rejoins it in the same session", async ({ page, mountAgentChat, eve }) => {
  test.setTimeout(30_000);
  const { calls, runtime } = await mountAgentChat(page, { existingSession: false });
  // A turn still running when the page opens (the fixture agent pauses 5s on "pause")
  const { session } = await new Client({ baseUrl: eve.baseUrl }).sessions.create({ message: "Reply after a pause" });
  const sessionId = session.state.sessionId;
  runtime.records.push({ id: sessionId, agent: "codex", persona: "kyoshi", createdAt: "2026-10-28T00:00:00Z", revision: 0 });
  await page.goto(`/authoring/${workspaceId}?session=${sessionId}`);
  await expect(page.getByText("Reply after a pause", { exact: true })).toBeVisible({ timeout: 4000 });
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect(page.getByText("Echo: Reply after a pause", { exact: true })).toBeVisible({ timeout: 10_000 });
  expect(calls).toContain(`GET /api/v1/workspaces/${workspaceId}/sessions/${sessionId}/eve/v1/session/${sessionId}/stream`);
  // The page opens it through its default route and sends nothing
  expect(calls.filter(call => call.startsWith("POST ") && !call.endsWith("/sessions/default"))).toHaveLength(0);
  expect(runtime.records.map(record => record.id)).toEqual([sessionId]);
});

test("a saved question resumes and its answer continues the turn", async ({ page, mountAgentChat }) => {
  test.setTimeout(30_000);
  const { sent, sessionId } = await mountAgentChat(page, { existingSession: "Please ask me first" });
  await page.goto(`/authoring/${workspaceId}?session=${sessionId}`);
  const review = page.getByRole("radio", { name: /Review/ });
  await expect(review).toBeVisible({ timeout: 4000 });
  await review.click();
  await expect(page.getByText("You chose Review.", { exact: true })).toBeVisible({ timeout: 10_000 });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ sessionId, body: { answers: [{ optionId: "Review" }] } });
});

test("a failed answer is reported and the reloaded question can be answered again", async ({ page, mountAgentChat }) => {
  test.setTimeout(30_000);
  let failures = 1;
  const { sent, sessionId } = await mountAgentChat(page, { existingSession: "Please ask me first", failRun: () => failures-- > 0 });
  await page.goto(`/authoring/${workspaceId}?session=${sessionId}`);
  const review = page.getByRole("radio", { name: /Review/ });
  await review.click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not send this note" })).toBeVisible({ timeout: 4000 });
  await page.getByRole("button", { name: "Reload conversation", exact: true }).click();
  await page.getByRole("radio", { name: /Review/ }).click();
  await expect(page.getByText("You chose Review.", { exact: true })).toBeVisible({ timeout: 10_000 });
  expect(sent).toHaveLength(1);
});

test("a conversation on a coding agent that's no longer selected opens the selected agent's conversation", async ({ page, mountAgentChat }) => {
  test.setTimeout(30_000);
  const mounted = await mountAgentChat(page);
  const { calls, sessionId, runtime } = mounted;
  runtime.records[0]!.agent = "opencode";
  await page.goto(`/authoring/${workspaceId}?session=${sessionId}`);
  await expect(page.getByText(greetingReply, { exact: true })).toBeVisible({ timeout: 10_000 });
  await keepsDraft(page);
  await expect(page.getByText(/selected coding agent/)).toHaveCount(0);
  expect(created(mounted)).toBe(1);
  expect(calls.some(call => call.includes(`/sessions/${sessionId}/eve/`))).toBe(false);
});

test("a conversation that no longer exists opens the selected agent's conversation", async ({ page, mountAgentChat }) => {
  test.setTimeout(30_000);
  const mounted = await mountAgentChat(page);
  await page.goto(`/authoring/${workspaceId}?session=gone`);
  await expect(page.getByText(savedReply, { exact: true })).toBeVisible({ timeout: 10_000 });
  await keepsDraft(page);
  await expect(page.getByText("Session not found.")).toHaveCount(0);
  expect(created(mounted)).toBe(0);
});

test("a conversation an older Eve built continues in a new session", async ({ page, mountAgentChat }) => {
  test.setTimeout(30_000);
  const mounted = await mountAgentChat(page);
  const { sessionId } = mounted;
  // Eve answers a session whose owner another Eve version built this way, and never runs it again
  await page.route(`**/sessions/${sessionId}/eve/v1/session/${sessionId}/stream*`, route => route.fulfill({
    status: 409, json: { error: "This session was built by eve 0.81.1.", code: "session_stranded", eveVersion: "0.81.1" },
  }));
  await page.goto(`/authoring/${workspaceId}?session=${sessionId}`);
  await expect(page.getByText(greetingReply, { exact: true })).toBeVisible({ timeout: 10_000 });
  await keepsDraft(page);
  // The requested conversation can't continue: a status line says so, with no alert
  await expect(page.getByRole("status").filter({ hasText: "That conversation can't be continued, so the newest one on Codex opened instead." })).toBeVisible();
  await expect(page.getByRole("alert").filter({ visible: true })).toHaveCount(0);
  expect(created(mounted)).toBe(1);
});

/** A stale `?session=` is dropped from the URL without loading the conversation again, so a typed draft stays (decision 16) */
async function keepsDraft(page: import("@playwright/test").Page) {
  const input = page.getByTestId("authoring-chat-composer").getByRole("textbox");
  await expect(input).toBeEnabled({ timeout: 10_000 });
  await input.fill("A draft I typed");
  await noSessionInUrl(page);
  await page.waitForTimeout(500);
  await expect(input).toHaveValue("A draft I typed");
}
