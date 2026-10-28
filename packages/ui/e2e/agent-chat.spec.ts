import { expect, test } from "@playwright/test";
import { turn } from "../../agent-api/src/fixtures";
import { draft, mountAgentChat as mount, sessionId, workspaceId } from "./agent-chat.fixture";

test("opening authoring without a session URL resumes its saved workspace conversation", async ({ page }) => {
  test.setTimeout(20_000);
  const { calls } = await mount(page);
  await page.goto(`/authoring?workspace=${workspaceId}`);
  await expect(page).toHaveURL(new RegExp(`session=${sessionId}(?:&|$)`), { timeout: 4000 });
  await expect(page.getByText("Your saved guidance.", { exact: true })).toBeVisible({ timeout: 4000 });
  expect(calls.filter(call => call === `POST /api/v1/workspaces/${workspaceId}/sessions`)).toHaveLength(0);
});

test("a failed saved-conversation lookup can retry without creating another conversation", async ({ page }) => {
  test.setTimeout(20_000);
  const { calls } = await mount(page);
  let unavailable = true;
  await page.route("**/api/v1/**/sessions?*", route => unavailable
    ? route.fulfill({ status: 503, json: { error: "temporarily_unavailable", message: "Saved conversations temporarily unavailable" } })
    : route.fallback());
  await page.goto(`/authoring?workspace=${workspaceId}`);
  await expect(page.getByRole("alert").filter({ hasText: "Saved conversations temporarily unavailable" })).toBeVisible({ timeout: 4000 });
  expect(calls.filter(call => call.startsWith("POST "))).toHaveLength(0);
  unavailable = false;
  await page.getByRole("button", { name: "Reload conversation", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`session=${sessionId}(?:&|$)`), { timeout: 4000 });
  await expect(page.getByText("Your saved guidance.", { exact: true })).toBeVisible({ timeout: 4000 });
  expect(calls.filter(call => call.startsWith("POST "))).toHaveLength(0);
});

test("the same conversation follows the open lesson and file without saving unsent editor changes", async ({ page }) => {
  test.setTimeout(30_000);
  const saves: string[] = [];
  page.on("request", request => { if (request.method() === "PUT" && request.url().includes("/api/authoring/files/")) saves.push(request.url()); });
  const { runtime, calls } = await mount(page, { draft: { ...draft, lessons: [{
    id: "first", title: "First lesson", description: "An introduction", senseiPath: "src/first/SENSEI.md",
    sensei: "# Teaching notes", hasSensei: true, evalPaths: [], checks: [],
    files: [{ path: "src/first/SENSEI.md", label: "SENSEI.md", content: "# Teaching notes" }],
  }] } });
  const contexts: unknown[] = [];
  runtime.context = async (_workspaceId, _request, forwardedProps) => { contexts.push(forwardedProps); return { course: "starter" }; };
  await page.goto(`/authoring?workspace=${workspaceId}&session=${sessionId}`);
  await expect(page.getByText("Your saved guidance.", { exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Main menu" });
  await navigation.getByRole("button", { name: "SENSEI.md", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Code editor", exact: true });
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("# Unsaved teaching notes");
  await expect(page.getByRole("tab", { name: /^SENSEI\.md/ })).toHaveAccessibleName(/unsaved changes/);
  const composer = page.getByTestId("authoring-chat-composer");
  await composer.getByRole("textbox").fill("Explain this file");
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => contexts.at(-1)).toEqual({ view: {
    scope: "lesson", lessonId: "first", file: "src/first/SENSEI.md", unsavedChanges: true,
  } });
  await expect(page.getByText("I received your notes.", { exact: true })).toBeVisible();
  await navigation.getByRole("button", { name: "dojo.yaml", exact: true }).click();
  await composer.getByRole("textbox").fill("Now explain the course manifest");
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => contexts.at(-1)).toEqual({ view: { scope: "course", file: "dojo.yaml", unsavedChanges: false } });
  expect(calls.filter(call => call === `POST /api/v1/workspaces/${workspaceId}/sessions`)).toHaveLength(0);
  expect(saves).toHaveLength(0);
});

test("authoring restores history and sends a file without text through the versioned API", async ({ page }) => {
  test.setTimeout(25_000);
  const { eve, calls } = await mount(page);
  await page.goto(`/authoring?workspace=${workspaceId}&session=${sessionId}`);
  await expect(page.getByText("Your saved guidance.", { exact: true })).toBeVisible({ timeout: 4000 });
  const composer = page.getByTestId("authoring-chat-composer");
  await expect(composer.getByRole("button", { name: "Agent", exact: true })).toContainText("Codex");
  await composer.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Course notes") });
  await composer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("I received your notes.", { exact: true })).toBeVisible({ timeout: 4000 });
  expect(eve.sent.at(-1)?.message).toEqual([{ type: "file", data: "data:text/plain;base64,Q291cnNlIG5vdGVz", mediaType: "text/plain", filename: "notes.txt" }]);
  expect(calls.some(call => call.endsWith(`/sessions/${sessionId}/runs`))).toBe(true);
  expect(calls.some(call => call === `POST /api/v1/workspaces/${workspaceId}/sessions`)).toBe(false);
});

test("an accepted conversation survives a failed history read and retries without another start", async ({ page }) => {
  test.setTimeout(25_000);
  let failRead = true;
  const { calls } = await mount(page, { existingSession: false, failRead: () => failRead });
  await page.goto(`/authoring?workspace=${workspaceId}`);
  await expect(page).toHaveURL(/session=session-1/, { timeout: 4000 });
  await expect(page.getByRole("alert").filter({ hasText: "Conversation temporarily unavailable" })).toBeVisible({ timeout: 4000 });
  await expect(page.getByRole("textbox", { name: "Code editor", exact: true })).toBeVisible();
  failRead = false;
  await page.getByRole("button", { name: "Reload conversation", exact: true }).click();
  await expect(page.getByText("I received your notes.", { exact: true })).toBeVisible({ timeout: 4000 });
  expect(calls.filter(call => call === `POST /api/v1/workspaces/${workspaceId}/sessions`)).toHaveLength(1);
});

test("new authoring opens its files and conversation without calling the retired backend discovery route", async ({ page }) => {
  test.setTimeout(20_000);
  await mount(page, { existingSession: false });
  const release = Promise.withResolvers<void>();
  let discoveries = 0;
  await page.route("**/api/authoring/backend*", async route => {
    discoveries++;
    await release.promise;
    return route.fulfill({ json: { backend: "eve" } });
  });
  try {
    await page.goto(`/authoring?workspace=${workspaceId}`);
    await expect(page.getByRole("tab", { name: "dojo.yaml", exact: true })).toBeVisible({ timeout: 4000 });
    await expect(page).toHaveURL(/session=session-1/, { timeout: 4000 });
    await expect(page.getByText("I received your notes.", { exact: true })).toBeVisible({ timeout: 4000 });
    expect(discoveries).toBe(0);
  } finally { release.resolve(); }
});

test("conversation reload preserves an unsent note and attachment through a failed retry", async ({ page }) => {
  test.setTimeout(25_000);
  let failRead = false;
  const { calls } = await mount(page, { failRead: () => failRead, failRun: () => true });
  await page.goto(`/authoring?workspace=${workspaceId}&session=${sessionId}`);
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
  expect(calls.filter(call => call.startsWith("POST "))).toHaveLength(1);
});

test("queued notes can be removed and stopping cancels the current API run", async ({ page }) => {
  test.setTimeout(25_000);
  const release = Promise.withResolvers<void>();
  const { eve } = await mount(page, { hold: release.promise });
  try {
    await page.goto(`/authoring?workspace=${workspaceId}&session=${sessionId}`);
    const input = page.getByTestId("authoring-chat-composer").getByRole("textbox");
    await expect(input).toBeEnabled({ timeout: 4000 });
    for (const text of ["First note", "Queued note", "Remove this note"]) {
      await input.fill(text);
      await input.press("Enter");
    }
    const queue = page.getByRole("region", { name: "Queued messages", exact: true });
    await expect(queue).toContainText("2 queued");
    await queue.getByRole("button", { name: 'Remove "Remove this note" from the queue', exact: true }).click();
    await expect(queue).toContainText("1 queued");
    await queue.getByRole("button").click();
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
    expect(eve.cancelled).toEqual([sessionId]);
  } finally { release.resolve(); }
});

test("opening an in-flight conversation rejoins its saved prefix in the same session", async ({ page }) => {
  test.setTimeout(25_000);
  const { eve, calls } = await mount(page);
  const reply = turn("active", "My question", ["Saved ", "reply."]);
  const cut = reply.findIndex(event => event.type === "message.appended") + 1;
  eve.histories.set(sessionId, reply.slice(0, cut));
  eve.continuations.set(sessionId, reply.slice(cut));
  await page.goto(`/authoring?workspace=${workspaceId}&session=${sessionId}`);
  await expect(page.getByText("Saved reply.", { exact: true })).toBeVisible({ timeout: 4000 });
  expect(calls.some(call => call.endsWith(`/sessions/${sessionId}/events`))).toBe(true);
  expect(calls.filter(call => call.startsWith("POST "))).toHaveLength(0);
  expect([...eve.histories.keys()]).toEqual([sessionId]);
});

for (const failures of [0]) test(`saved questions resume through the API and release queued notes (failures=${failures})`, async ({ page }) => {
  test.setTimeout(25_000);
  let attempts = 0;
  const { eve } = await mount(page, { failRun: () => attempts++ < failures });
  eve.histories.set(sessionId, turn("question", "Help me", ["Choose a next step."], { question: true }));
  await page.goto(`/authoring?workspace=${workspaceId}&session=${sessionId}`);
  const review = page.getByRole("radio", { name: /Review/ });
  await expect(review).toBeVisible({ timeout: 4000 });
  const input = page.getByTestId("authoring-chat-composer").getByRole("textbox");
  await input.fill("My queued note");
  await input.press("Enter");
  await expect(page.getByRole("region", { name: "Queued messages", exact: true })).toContainText("1 queued");
  await review.click();
  if (failures) await page.getByRole("button", { name: "Retry answer", exact: true }).click();
  await expect.poll(() => eve.answered.length).toBe(1);
  await expect.poll(() => eve.sent.length).toBe(1);
  expect(eve.answered[0]).toMatchObject({ sessionId, answers: [{ requestId: "question-q", optionId: "review" }] });
  expect(eve.sent[0]).toMatchObject({ sessionId, message: "My queued note" });
  await expect(page.getByRole("region", { name: "Queued messages", exact: true })).toHaveCount(0);
});
