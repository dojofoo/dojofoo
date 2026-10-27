import { expect, test } from "@playwright/test";

for (const mode of ["authoring", "learner", "interactive"] as const) test(`${mode} account settings preserve the unsent workspace and return to it`, async ({ page }) => {
  const writes: string[] = [];
  const reads: string[] = [];
  const initial = mode === "authoring" ? "name: Settings course\n" : "export const answer = 0;\n";
  const draft = mode === "interactive" ? "Keep this unsent question" : initial + (mode === "authoring" ? "# Keep this draft" : "// Keep this draft");
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
    if (request.method() !== "GET") writes.push(path);
    reads.push(path);
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: { root: "/tmp/settings-course", style: "katas", name: "Settings course", description: "One focused outcome", language: "TypeScript",
      manifestSource: initial, courseGuidance: "", rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: initial }], lessons: [], issues: [], courseChecks: [] } });
    if (path.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" }, messages } });
    if (path === "/api/control/courses") return route.fulfill({ json: [{ workspaceId: "settings-workspace", dojo: "settings-course", kata: "first", mode: "katas", workspaceName: "Settings", selected: true, sessionId: "saved", sessions: [{ lessonId: "first", sessionId: "saved" }] }] });
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: { dojo: "settings-course", kata: "first", title: "First lesson", briefing: "One focused outcome", code: initial, starterCode: initial,
      fileId: "solution", filePath: "first.ts", language: "typescript", introduced: true, checkpointed: false, sessionId: "saved", harness: "codex", harnesses: ["codex"], model: null,
      state: "ongoing", isCurrent: true, result: null, fragments: {}, messages, lessons: [{ name: "first", title: "First lesson", summary: "One focused outcome", state: "ongoing", isCurrent: true }] } });
    if (path.endsWith("/conversation")) return route.fulfill({ json: { sessionId: "saved", harness: "codex", harnesses: ["codex"], model: null, messages } });
    if (path.endsWith("/interactive")) return route.fulfill({ json: { dojo: "settings-course", title: "Settings course", lessonTitle: "First lesson", step: 0, totalSteps: 1, complete: false, response: null,
      current: { id: "first", type: "present", title: "First step", content: "One focused outcome", contentBase: null } } });
    return route.fulfill({ status: 404 });
  });
  const url = mode === "authoring" ? "/authoring?session=saved" : mode === "learner"
    ? "/course/settings-workspace/settings-course/lesson/first" : "/interactive?workspace=settings-workspace&course=settings-course";
  await page.goto(url);
  const editor = mode === "interactive" ? null : page.locator(".ui-ed__monaco");
  const input = page.getByRole("textbox", { name: mode === "interactive" ? "Message the sensei" : "Code editor", exact: true });
  await expect(input).toBeEnabled();
  if (editor) {
    await expect(page.locator(".view-lines")).toContainText(initial.trim());
    await input.focus();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(draft);
  } else await input.fill(draft);
  const mounted = await editor?.elementHandle();
  const model = editor ? await page.locator(".monaco-editor[data-uri]").getAttribute("data-uri") : null;
  const beforeReads = [...reads];
  const workspaceUrl = page.url();
  await page.getByRole("button", { name: "You", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("region", { name: "Account settings", exact: true });
  await expect(settings.getByRole("tab", { name: "Appearance", exact: true })).toHaveAttribute("aria-selected", "true");
  if (mounted) expect(await mounted.evaluate(node => node.isConnected)).toBe(true);
  await settings.getByRole("radio", { name: "Japan Blues", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "japan-blues");
  if (mode === "authoring") await page.screenshot({ path: test.info().outputPath("workspace-account-appearance.png"), animations: "disabled" });
  await settings.getByRole("button", { name: "Back to workspace", exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(page).toHaveURL(workspaceUrl);
  if (editor) await expect(page.locator(".view-lines")).toContainText("Keep this draft");
  else await expect(input).toHaveValue(draft);
  await page.getByRole("button", { name: "You", exact: true }).click();
  await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
  await expect(settings.getByRole("tab", { name: "General", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(settings.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("You");
  await expect(settings.getByRole("textbox", { name: "Name", exact: true })).toBeDisabled();
  await expect(settings.getByRole("tab", { name: "API keys", exact: true })).toHaveCount(0);
  if (mode === "authoring") await page.screenshot({ path: test.info().outputPath("workspace-account-profile.png"), animations: "disabled" });
  await settings.getByRole("button", { name: "Back to workspace", exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(page).toHaveURL(workspaceUrl);
  if (editor) {
    await expect(page.locator(".monaco-editor[data-uri]")).toHaveAttribute("data-uri", model!);
    await expect(page.locator(".view-lines")).toContainText("Keep this draft");
    await input.focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.locator(".view-lines")).not.toContainText("Keep this draft");
  } else await expect(input).toHaveValue(draft);
  expect(reads).toEqual(beforeReads);
  expect(writes).toEqual([]);
  await page.screenshot({ path: test.info().outputPath(`${mode}-after-account-settings.png`), animations: "disabled" });
});
