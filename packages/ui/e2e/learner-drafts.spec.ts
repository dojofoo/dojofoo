import { expect, test } from "@playwright/test";
import { toServerSentEventsResponse } from "@tanstack/ai";
import { streamAcpAsAgUi } from "../src/server/lesson/agui-stream";

test.setTimeout(60_000);

const starter = "export const answer = 0;\n";
const guidance = [{ id: "opening", role: "assistant", parts: [{ type: "text", content: "Start with one small example." }] }];
const lesson = { dojo: "draft-course", kata: "first", title: "First lesson", briefing: "One outcome", code: starter, starterCode: starter,
  fileId: "solution", filePath: "first.ts", language: "typescript", introduced: false, checkpointed: false,
  sessionId: null, harness: "codex", harnesses: ["codex"], model: null, state: "ongoing", isCurrent: true, result: null, fragments: {}, messages: [],
  lessons: [{ name: "first", title: "First lesson", summary: "One outcome", state: "ongoing", isCurrent: true }] };

for (const operation of ["introduction", "answer"] as const) test(`a delayed ${operation} cannot reopen a lesson after leaving it`, async ({ page }) => {
  const reply = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<import("@playwright/test").Request>();
  let introduced = operation === "answer";
  const questionMessage = { id: "question", role: "assistant", parts: [{ type: "tool-call", id: "ask", name: "elicitation", arguments: "{}",
    input: { questions: [{ id: "decision", title: "What should we try?", options: [{ id: "example", title: "A small example" }] }] }, state: "input-complete" }] };
  const first = { ...lesson, lessons: [...lesson.lessons, { name: "second", title: "Second lesson", summary: "Review an example", state: "completed", isCurrent: false }] };
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/control/courses") return route.fulfill({ json: [] });
    if (url.pathname === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (url.pathname.endsWith("/diagnostics")) return route.fulfill({ json: [] });
    if (url.pathname.endsWith("/completions")) return route.fulfill({ json: { from: 0, options: [] } });
    if (url.pathname.endsWith("/lessons/second")) return route.fulfill({ json: { ...lesson, kata: "second", title: "Second lesson", filePath: "second.ts", code: "export const second = 2;", introduced: true, sessionId: "second-session" } });
    if (url.pathname.endsWith("/lessons/first")) {
      if (operation === "introduction" && introduced && url.searchParams.get("prepare") !== "false") {
        pending.resolve(request);
        await reply.promise;
      }
      return route.fulfill({ json: { ...first, introduced, sessionId: introduced ? "first-session" : null, messages: operation === "answer" ? [questionMessage] : introduced ? guidance : [] } });
    }
    if (url.pathname.endsWith("/messages") && request.method() === "POST") {
      if (operation === "answer") {
        pending.resolve(request);
        await reply.promise;
        return route.fulfill({ json: { ...first, introduced: true, sessionId: "first-session" } });
      }
      introduced = true;
      const body = request.postDataJSON();
      const response = toServerSentEventsResponse(streamAcpAsAgUi({ threadId: body.threadId, runId: body.runId, execute: async emit => {
        emit({ type: "text-start", id: "opening" });
        emit({ type: "text-delta", id: "opening", delta: "Start with one small example." });
        emit({ type: "text-end", id: "opening" });
      } }));
      return route.fulfill({ contentType: "text/event-stream", body: await response.text() });
    }
    return route.fulfill({ status: 404 });
  });
  try {
    await page.goto("/course/draft-workspace/draft-course/lesson/first");
    if (operation === "answer") await page.getByRole("radio", { name: /A small example/ }).click();
    const request = await pending.promise;
    await page.getByRole("link", { name: /Second lesson/ }).click();
    await expect(page.locator(".view-lines")).toContainText("export const second = 2;");
    const question = page.getByTestId("chat-composer").getByRole("textbox");
    await question.fill("A question for the second lesson");
    reply.resolve();
    await request.response();
    await question.press("End");
    await expect(page).toHaveURL(/\/lesson\/second$/, { timeout: 5000 });
    await expect(page.locator(".view-lines")).toContainText("export const second = 2;");
    await expect(question).toHaveValue("A question for the second lesson");
  } finally { reply.resolve(); }
});

for (const path of ["/course/draft-workspace/draft-course/lesson/first", "/course/draft-workspace"]) {
  test(`an introduction keeps unsaved work and exposes a resumable session from ${path}`, async ({ page }, info) => {
    const introduction = Promise.withResolvers<void>();
    const refresh = Promise.withResolvers<void>();
    let introduced = false;
    let savedCode = starter;
    const turns: unknown[] = [];
    await page.routeWebSocket("**/api/session*", () => {});
    await page.route("**/api/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === "/api/control/courses") return route.fulfill({ json: [{
        workspaceId: "draft-workspace", dojo: "draft-course", kata: "first", mode: "katas", workspaceName: "Drafts", selected: true,
        sessionId: introduced ? "introduced" : null, sessions: introduced ? [{ lessonId: "first", sessionId: "introduced" }] : [],
      }] });
      if (url.pathname === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
      if (url.pathname.endsWith("/diagnostics")) return route.fulfill({ json: [] });
      if (url.pathname.endsWith("/completions")) return route.fulfill({ json: { from: 0, options: [] } });
      if (url.pathname.endsWith("/files/solution") && request.method() === "PUT") {
        savedCode = request.postDataJSON().content;
        return route.fulfill({ json: { type: "lesson-files", id: "solution", attributes: { content: savedCode } } });
      }
      if (url.pathname.endsWith("/lessons/first")) {
        if (introduced && url.searchParams.get("prepare") !== "false") await refresh.promise;
        return route.fulfill({ json: { ...lesson, code: savedCode, introduced, sessionId: introduced ? "introduced" : null, messages: introduced ? guidance : [] } });
      }
      if (url.pathname.endsWith("/messages") && request.method() === "POST") {
        const body = request.postDataJSON();
        turns.push(body);
        await introduction.promise;
        introduced = true;
        const response = toServerSentEventsResponse(streamAcpAsAgUi({ threadId: body.threadId, runId: body.runId, execute: async emit => {
          emit({ type: "text-start", id: "opening" });
          emit({ type: "text-delta", id: "opening", delta: guidance[0]!.parts[0]!.content });
          emit({ type: "text-end", id: "opening" });
        } }));
        return route.fulfill({ contentType: "text/event-stream", body: await response.text() });
      }
      return route.fulfill({ status: 404 });
    });
    try {
      await page.goto(path);
      await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
      const editor = page.getByRole("textbox", { name: "Code editor", exact: true });
      await editor.press("ControlOrMeta+End");
      await page.keyboard.insertText("// Keep my introduction edit");
      introduction.resolve();
      const question = page.getByTestId("chat-composer").getByRole("textbox");
      await expect(question).toBeEnabled();
      await question.fill("Keep my unsent follow-up");
      refresh.resolve();
      await expect(page).toHaveURL(/\/session\/introduced$/, { timeout: 5000 });
      await expect(page.getByText("Start with one small example.", { exact: true })).toBeVisible();
      await expect(page.locator(".view-lines")).toContainText("Keep my introduction edit");
      await expect(question).toHaveValue("Keep my unsent follow-up");
      await page.screenshot({ path: info.outputPath("introduction-preserved-drafts.png"), animations: "disabled" });
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
      // A copied session URL must resume through the normal session route too.
      await page.goto(page.url());
      await expect(page.locator(".view-lines")).toContainText("Keep my introduction edit");
      await expect(page.getByText("Start with one small example.", { exact: true })).toBeVisible();
      expect(turns).toHaveLength(1);
    } finally { introduction.resolve(); refresh.resolve(); }
  });
}

test("a save acknowledgement preserves later edits and an explicit reset still replaces them", async ({ page }) => {
  const save = Promise.withResolvers<void>();
  let savedCode = starter;
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/control/courses") return route.fulfill({ json: [] });
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/diagnostics")) return route.fulfill({ json: [] });
    if (path.endsWith("/completions")) return route.fulfill({ json: { from: 0, options: [] } });
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: { ...lesson, code: savedCode, sessionId: "saved", introduced: true, messages: guidance } });
    if (path.endsWith("/files/solution") && request.method() === "PUT") {
      await save.promise;
      savedCode = request.postDataJSON().content;
      return route.fulfill({ json: { type: "lesson-files", id: "solution", attributes: { content: savedCode } } });
    }
    return route.fulfill({ status: 404 });
  });
  try {
    await page.goto("/course/draft-workspace/draft-course/lesson/first");
    const editor = page.getByRole("textbox", { name: "Code editor", exact: true });
    await editor.press("ControlOrMeta+End");
    await page.keyboard.insertText("// Submitted edit");
    const requested = page.waitForRequest(request => request.method() === "PUT" && new URL(request.url()).pathname.endsWith("/files/solution"));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await requested;
    await editor.press("ControlOrMeta+End");
    await page.keyboard.insertText("\n// Later edit while saving");
    const acknowledged = page.waitForResponse(response => response.request().method() === "PUT");
    save.resolve();
    await acknowledged;
    await expect(page.locator(".view-lines")).toContainText("Later edit while saving");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    expect(savedCode).toContain("Later edit while saving");
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.getByRole("dialog", { name: "Reset this lesson?", exact: true }).getByRole("button", { name: "Reset lesson", exact: true }).click();
    await expect(page.locator(".view-lines")).not.toContainText("Submitted edit");
    await expect(page.locator(".view-lines")).not.toContainText("Later edit while saving");
    expect(savedCode).toBe(starter);
  } finally { save.resolve(); }
});
