import { expect, test } from "@playwright/test";

test("authoring search opens the chosen course or lesson file and preserves editor and chat drafts", async ({ page }) => {
  const writes: string[] = [];
  let sessionReads = 0;
  const workspace = { root: "/tmp/search-course", style: "katas", name: "Search course", description: "One outcome", language: "TypeScript",
    manifestSource: "name: Search course\n", courseGuidance: "# Course guidance", issues: [], courseChecks: [],
    rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: "name: Search course\n" }, { path: "DOJO.md", label: "DOJO.md", content: "# Course guidance" }],
    lessons: ["first", "second"].map(id => ({ id, title: `${id === "first" ? "First" : "Second"} lesson`, description: "One outcome", checks: [],
      senseiPath: `src/${id}/SENSEI.md`, files: [{ path: `src/${id}/SENSEI.md`, label: "SENSEI.md", content: `# ${id === "first" ? "First" : "Second"} lesson` }] })),
  };
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (request.method() !== "GET") writes.push(path);
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: workspace });
    if (path.endsWith("/reports")) return route.fulfill({ json: { statuses: {} } });
    if (path.endsWith("/report")) return route.fulfill({ json: { report: null } });
    if (path.endsWith("/sessions/saved")) {
      sessionReads += 1;
      return route.fulfill({ json: { session: { sessionId: "saved" }, messages: [] } });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto("/authoring?session=saved");
  const input = page.getByRole("textbox", { name: "Code editor", exact: true });
  const lines = page.locator(".monaco-editor .view-lines");
  await expect(lines).toContainText("name: Search course");
  const originalEditor = await page.locator(".ui-ed__monaco").elementHandle();
  const originalModel = await page.locator(".monaco-editor[data-uri]").getAttribute("data-uri");
  await input.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("name: Search course\n# Keep this draft");
  const chatDraft = page.getByTestId("authoring-chat-composer").getByRole("textbox");
  await chatDraft.fill("Keep this unsent guidance");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Command menu", exact: true });
  const search = palette.getByRole("combobox");
  await search.fill("SENSEI.md");
  await expect(palette.getByRole("option")).toHaveCount(2, { timeout: 5_000 });
  await palette.getByRole("option").filter({ hasText: "Second lesson" }).click();
  await expect(palette).not.toBeVisible();
  await expect(lines).toContainText("# Second lesson");
  await expect(page.getByRole("navigation", { name: "Breadcrumb", exact: true })).toContainText("Second lesson");
  await page.keyboard.press("Alt+k");
  await search.fill("first/SENSEI.md");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(lines).toContainText("# First lesson");
  await page.keyboard.press("Alt+k");
  await search.fill("dojo.yaml");
  await search.press("Enter");
  await expect(lines).toContainText("# Keep this draft");
  expect(await page.locator(".ui-ed__monaco").evaluate((node, original) => node === original, originalEditor)).toBe(true);
  await expect(page.locator(".monaco-editor[data-uri]")).toHaveAttribute("data-uri", originalModel!);
  await expect(chatDraft).toHaveValue("Keep this unsent guidance");
  await input.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(lines).not.toContainText("# Keep this draft");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press("Alt+k");
  await search.fill("SENSEI.md");
  await expect(palette.getByText("First lesson", { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(palette.getByText("Second lesson", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("authoring-file-search-phone.png"), animations: "disabled" });
  await palette.getByRole("option").filter({ hasText: "Second lesson" }).click();
  await expect(lines).toContainText("# Second lesson");
  await page.keyboard.press("Alt+k");
  await search.fill("DOJO.md");
  await expect(palette).toBeInViewport({ ratio: 1 });
  await search.press("Enter");
  await expect(lines).toContainText("# Course guidance");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(sessionReads).toBe(1);
  expect(writes).toEqual([]);
});
