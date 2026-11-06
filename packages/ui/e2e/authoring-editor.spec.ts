import { expect, test } from "./agent-chat.fixture";

test("authoring uses shared editor preferences while retaining file models and the native save", async ({ page, mountAgentChat }) => {
  await page.addInitScript(() => localStorage.setItem("uix:preferences", JSON.stringify({ editorSize: 13 })));
  let workspace = { root: "/tmp/editor-course", style: "katas", name: "Editor course", description: "One outcome", language: "TypeScript",
    manifestSource: "name: Editor course\n", courseGuidance: "# Guidance", rootFiles: [
      { path: "dojo.yaml", label: "dojo.yaml", content: "name: Editor course\n" },
      { path: "DOJO.md", label: "DOJO.md", content: "# Guidance" },
    ], lessons: [], issues: [], courseChecks: [] };
  const saves: Array<{ path: string; content: string }> = [];
  const unexpected: string[] = [];
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: workspace });
    if (path === "/api/authoring/files/dojo.yaml" && request.method() === "PUT") {
      const { content } = request.postDataJSON();
      saves.push({ path, content });
      workspace = { ...workspace, rootFiles: workspace.rootFiles.map(file => file.path === "dojo.yaml" ? { ...file, content } : file) };
      return route.fulfill({ json: workspace });
    }
    if (request.method() !== "GET") unexpected.push(path);
    return route.fulfill({ status: 404 });
  });
  const agent = await mountAgentChat(page, { root: workspace.root, files: false });
  await page.goto(`/authoring/ws-1?session=${agent.sessionId}`);
  const lines = page.locator(".monaco-editor .view-lines");
  await expect(lines).toContainText("name: Editor course");
  // The authoring story has course/file sections, without dashboard navigation.
  const sidebar = page.getByRole("navigation", { name: "Main menu", exact: true });
  await expect(sidebar.getByRole("link", { name: "Courses", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "Courses", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Course navigation", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Lessons", exact: true })).toHaveCount(0);
  await expect(page.getByRole("treeitem", { name: "Default", exact: true })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "Chapters", exact: true })).toBeVisible();

  await expect(lines).toHaveCSS("font-size", "13px");
  await expect(page.locator(".ui-ed__code")).toBeVisible();
  const editor = await page.locator(".ui-ed__monaco").elementHandle();
  const modelUri = await page.locator(".monaco-editor[data-uri]").getAttribute("data-uri");
  const input = page.getByRole("textbox", { name: "Code editor", exact: true });
  await input.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("name: Editor course\n# Unsaved guidance");
  const tab = page.getByRole("tab", { name: /^dojo\.yaml\b/ });
  await expect(tab).toHaveAccessibleName(/unsaved changes/);
  const transitions = await page.evaluate(() => {
    const state = window as typeof window & { fileTransitions: number };
    state.fileTransitions = 0;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = ((...args: Parameters<typeof start>) => { state.fileTransitions++; return start(...args); }) as typeof start;
    return state.fileTransitions;
  });
  await page.getByRole("navigation", { name: "Main menu" }).getByRole("treeitem", { name: "DOJO.md", exact: true }).locator(":scope > div").click();
  await expect(lines).toContainText("# Guidance");
  await tab.click();
  await expect(lines).toContainText("# Unsaved guidance");
  expect(await page.evaluate(() => (window as typeof window & { fileTransitions: number }).fileTransitions)).toBe(transitions);
  expect(await page.locator(".ui-ed__monaco").evaluate((node, previous) => node === previous, editor)).toBe(true);
  await expect(page.locator(".monaco-editor[data-uri]")).toHaveAttribute("data-uri", modelUri!);
  await input.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(lines).not.toContainText("# Unsaved guidance");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("name: Editor course\n# Saved guidance");
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(() => saves).toEqual([{ path: "/api/authoring/files/dojo.yaml", content: "name: Editor course\n# Saved guidance" }]);
  await expect(tab).toHaveAccessibleName("dojo.yaml");
  await page.screenshot({ path: test.info().outputPath("authoring-shared-editor-dark.png"), animations: "disabled" });
  const background = page.locator(".ui-ed__body");
  const token = lines.locator('[class*="mtk"]').first();
  const darkToken = await token.evaluate(node => getComputedStyle(node).color);
  const dark = await background.evaluate(node => getComputedStyle(node).backgroundColor);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await expect.poll(() => background.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe(dark);
  await expect.poll(() => token.evaluate(node => getComputedStyle(node).color)).not.toBe(darkToken);
  expect(await page.locator(".ui-ed__monaco").evaluate((node, previous) => node === previous, editor)).toBe(true);
  await expect(page.locator(".monaco-editor[data-uri]")).toHaveAttribute("data-uri", modelUri!);
  await expect(lines).toContainText("# Saved guidance");
  await page.screenshot({ path: test.info().outputPath("authoring-shared-editor-light.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("authoring-shared-editor-phone.png"), animations: "disabled" });
  expect(unexpected).toEqual([]);
});
