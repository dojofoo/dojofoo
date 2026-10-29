import { expect, test } from "@playwright/test";

test("a direct trial route loads the browser modules without starting a harness", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/control/courses", route => route.fulfill({ json: [] }));
  await page.route("**/api/workspaces/**", route => route.fulfill({ status: 404, json: { error: "Course not found." } }));
  await page.goto("/course/import-check/starter-kata/lesson/001-example");
  await expect(page.getByText("Course not found.", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await page.reload();
  await expect(page.getByText("Course not found.", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const outcome of ["success", "accepted before error"] as const) test(`a trial shows editable files before its selected agent starts and resumes on reload (${outcome})`, async ({ page }) => {
  const prepared = Promise.withResolvers<void>();
  const starts: unknown[] = [];
  let sessionId: string | null = null;
  const snapshot = () => ({ dojo: "trial-course", kata: "first", title: "First lesson", briefing: "Try a small example.",
    code: "export const answer = 0;\n", starterCode: "export const answer = 0;\n", fileId: "solution", filePath: "first.ts", language: "typescript",
    introduced: true, checkpointed: false, sessionId, harness: sessionId ? "codex" : undefined, harnesses: ["opencode", "codex"], model: null,
    state: "ongoing", isCurrent: true, result: null, fragments: {},
    messages: sessionId ? [{ id: "saved", role: "assistant", parts: [{ type: "text", content: "Ready to learn." }] }] : [],
    lessons: [{ name: "first", title: "First lesson", summary: "Try it", state: "ongoing", isCurrent: true }] });
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/control/courses") return route.fulfill({ json: [] });
    if (url.pathname === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (url.pathname.endsWith("/diagnostics")) return route.fulfill({ json: [] });
    if (url.pathname.endsWith("/completions")) return route.fulfill({ json: { from: 0, options: [] } });
    if (url.pathname.endsWith("/sessions") && request.method() === "POST") {
      starts.push(request.postDataJSON());
      await prepared.promise;
      sessionId = "saved-trial";
      if (outcome === "accepted before error") return route.fulfill({ status: 502, json: { error: "Connection interrupted after startup" } });
      return route.fulfill({ status: 201, json: snapshot() });
    }
    if (url.pathname.endsWith("/lessons/first")) {
      if (url.searchParams.get("prepare") !== "false") await prepared.promise;
      return route.fulfill({ json: snapshot() });
    }
    return route.fulfill({ status: 404 });
  });
  try {
    await page.goto("/course/trial-workspace/trial-course/lesson/first?harness=codex");
    const editor = page.getByRole("textbox", { name: "Code editor", exact: true });
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.press("ControlOrMeta+End");
    await page.keyboard.insertText("// Keep my edit while the agent starts");
    await expect.poll(() => starts, { timeout: 5000 }).toEqual([{ harness: "codex" }]);
    prepared.resolve();
    if (outcome === "accepted before error") {
      await expect(page.getByRole("alert").filter({ hasText: "Connection interrupted after startup" })).toBeVisible();
      await page.getByRole("button", { name: "Reload conversation", exact: true }).click();
    }
    await expect(page.getByText("Ready to learn.", { exact: true })).toBeVisible();
    await expect(page.locator(".view-lines")).toContainText("Keep my edit while the agent starts");
    await page.reload();
    await expect(page.getByText("Ready to learn.", { exact: true })).toBeVisible();
    expect(starts).toEqual([{ harness: "codex" }]);
  } finally { prepared.resolve(); }
});
