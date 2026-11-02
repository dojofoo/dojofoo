import type { WebSocketRoute } from "@playwright/test";
import type { AuthoringDraft } from "@dojofoo/authoring/service";
import { expect, test } from "./agent-chat.fixture";

test("authoring keeps the live card, saves its color, groups chapters, and opens the evals window", async ({ page, mountAgentChat }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  let socket!: WebSocketRoute;
  let workspace: AuthoringDraft = { root: "/tmp/card-authoring-course", name: "Card course", style: "katas", description: "One course", language: "TypeScript", version: "1.0.0", author: "Course author", repository: "author/course", appearance: { hue: 120 }, chapters: [], manifestSource: "name: Card course\n", courseGuidance: "", rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: "name: Card course\n" }], lessons: [], issues: [], courseChecks: [] };
  const writes: unknown[] = [];
  await page.routeWebSocket("**/api/authoring/changes*", ws => { socket = ws; });
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: workspace });
    if (path.endsWith("/course") && route.request().method() === "PATCH") {
      const input = route.request().postDataJSON(); writes.push(input);
      workspace = { ...workspace, appearance: { ...workspace.appearance, ...input.appearance } };
      return route.fulfill({ json: workspace });
    }
    return route.fulfill({ status: 404 });
  });
  await mountAgentChat(page, { root: workspace.root, files: false });
  await page.goto("/authoring?workspace=ws-1&session=saved");
  const card = page.getByLabel("Course card preview", { exact: true });
  await expect(card).toContainText("Card course");
  const color = page.getByRole("button", { name: "Card color", exact: true });
  await expect(color).toBeVisible();
  const triggerBox = await color.boundingBox();
  expect(triggerBox?.width).toBe(28);
  await expect(page.getByRole("textbox", { name: "Code editor", exact: true })).toBeVisible();
  const layout = () => page.evaluate(() => {
    const rect = document.querySelector(".ui-as-main")!.getBoundingClientRect();
    return { width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight, main: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  });
  const beforePicker = await layout();
  await color.click();
  const picker = page.getByRole("dialog", { name: "Card color picker" });
  await expect(picker).toBeVisible();
  expect(await layout()).toEqual(beforePicker);
  expect(await picker.evaluate(el => Boolean(el.closest(".ui-as-side")))).toBe(false);
  const field = picker.getByRole("textbox", { name: "Card color in Hex", exact: true });
  await field.fill("#123456");
  await field.press("Enter");
  await expect(field).toHaveValue("#123456");
  await expect.poll(() => picker.evaluate(el => getComputedStyle(el).opacity)).toBe("1");
  await expect(picker.getByRole("slider", { name: "Opacity", exact: true })).toHaveCount(0);
  await expect(picker).not.toContainText("Card color");
  await expect(picker).not.toContainText("against background");
  await expect(picker.getByRole("listbox", { name: "Saved colors" })).toHaveCount(0);
  await expect(picker.getByRole("button", { name: /^Save #/ })).toHaveCount(0);
  const pipette = picker.getByRole("button", { name: "Pick a color from the screen", exact: true });
  expect(await pipette.evaluate(el => getComputedStyle(el).getPropertyValue("corner-shape"))).toMatch(/^(round|superellipse\(1\))$/);
  expect(await pipette.evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThanOrEqual(16);
  await picker.getByRole("button", { name: "Format: Hex. Switch format", exact: true }).click();
  const rgbField = picker.getByRole("textbox", { name: "Card color in RGB", exact: true });
  await expect(rgbField).toHaveValue("rgb(18 52 86)");
  expect(await rgbField.evaluate(el => getComputedStyle(el).color)).not.toBe("rgba(0, 0, 0, 0)");
  await picker.getByRole("button", { name: "Format: RGB. Switch format", exact: true }).click();
  await picker.getByRole("button", { name: "Format: HSL. Switch format", exact: true }).click();
  await picker.getByRole("button", { name: "Format: OKLCH. Switch format", exact: true }).click();
  await expect(field).toHaveValue("#123456");
  await expect(picker.getByRole("button", { name: "Apply", exact: true })).toBeVisible();
  expect(await picker.getByRole("slider", { name: "Hue", exact: true }).evaluate(el => getComputedStyle(el).getPropertyValue("corner-shape"))).toMatch(/^(round|superellipse\(1\))$/);
  const windowCorners = await picker.evaluate(el => getComputedStyle(el).getPropertyValue("corner-shape"));
  expect(await field.evaluate(el => getComputedStyle(el.parentElement!.parentElement!).getPropertyValue("corner-shape"))).toBe(windowCorners);
  expect(await picker.getByRole("button", { name: "Apply", exact: true }).evaluate(el => getComputedStyle(el).getPropertyValue("corner-shape"))).toBe(windowCorners);
  const area = picker.getByRole("slider", { name: "Saturation and brightness", exact: true }).locator("..");
  expect(await area.evaluate(el => getComputedStyle(el).getPropertyValue("corner-shape"))).toBe(windowCorners);
  expect(await area.evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius))).toBeLessThan(30);
  expect(await area.evaluate(el => getComputedStyle(el).backgroundImage)).toContain("linear-gradient");
  expect(await area.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  expect(await color.evaluate(el => getComputedStyle(el).getPropertyValue("corner-shape"))).toMatch(/^(round|superellipse\(1\))$/);
  const panelBox = await picker.boundingBox();
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(1440);
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(1000);
  expect(await field.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(13);
  await expect(page.getByRole("textbox", { name: "Code editor", exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("authoring-color-picker.png"), animations: "disabled" });
  await picker.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(() => writes).toEqual([{ appearance: { color: "#123456" } }]);
  await expect(picker).toHaveCount(0);
  expect(await layout()).toEqual(beforePicker);
  await page.reload();
  await color.click();
  await expect(field).toHaveValue("#123456");
  await picker.getByRole("button", { name: "Apply", exact: true }).click();
  expect(writes).toHaveLength(1);
  const editor = page.getByRole("textbox", { name: "Code editor", exact: true });
  await editor.focus(); await page.keyboard.press("ControlOrMeta+End"); await page.keyboard.insertText("\n# local edit");
  await page.evaluate(() => {
    const state = window as typeof window & { cardTransitions: number };
    state.cardTransitions = 0;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = ((...args: Parameters<typeof start>) => {
      const transition = start(...args);
      if (transition.types.has("ui-card")) state.cardTransitions++;
      return transition;
    }) as typeof start;
  });
  const chapter = { id: "foundations", title: "Foundations", path: "src/foundations" };
  workspace = { ...workspace, title: "Agent edited course", name: "Agent edited course", language: "Python", version: "1.1.0", appearance: { color: "#3677C9", hue: 210, shader: "waves" }, chapters: [chapter], rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: "name: Agent edited course\n" }], lessons: [{ id: "first", title: "First lesson", description: "Start here", chapter, senseiPath: "src/foundations/first/SENSEI.md", sensei: "# First lesson", hasSensei: true, evalPaths: [], checks: [], files: [{ path: "src/foundations/first/SENSEI.md", label: "SENSEI.md", content: "# First lesson" }] }] };
  await expect.poll(() => Boolean(socket)).toBe(true);
  socket.send(JSON.stringify({ jsonrpc: "2.0", method: "workspace.changed", params: {} }));
  await expect(card).toContainText("Agent edited course");
  await expect(card).toContainText("1.1.0");
  await expect.poll(() => page.evaluate(() => (window as typeof window & { cardTransitions: number }).cardTransitions)).toBeGreaterThan(0);
  await expect(color).toHaveAttribute("title", "#3677C9");
  await expect(color).toBeDisabled();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("# local edit");
  const tree = page.getByRole("tree", { name: "Course files and chapters", exact: true });
  const foundations = tree.getByRole("treeitem", { name: "Foundations", exact: true });
  await expect(foundations).toBeVisible();
  await foundations.locator(":scope > div").click();
  await expect(foundations.getByRole("treeitem", { name: "First lesson", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Course navigation", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Courses", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Evals", exact: true }).click();
  await expect(page.locator(".ui-as-chat__evals .ui-ev")).toBeVisible();
  await expect(page.locator(".ui-as-chat__crumbs")).toContainText("Evals");
  const divider = page.locator(".ui-ev__table tbody tr").first();
  await expect(divider).toBeVisible();
  expect(await divider.evaluate(el => {
    const probe = document.createElement("span"); probe.style.color = "var(--fluid-hairline)"; el.append(probe);
    const neutral = getComputedStyle(probe).color; probe.remove();
    return getComputedStyle(el).borderBottomColor === neutral;
  })).toBe(true);
  await page.screenshot({ path: test.info().outputPath("authoring-evals-preview.png"), animations: "disabled" });
  await tree.getByRole("treeitem", { name: "dojo.yaml", exact: true }).locator(":scope > div").click();
  await expect(page.locator(".ui-as-chat__evals")).toBeHidden();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("# local edit");
  expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("authoring-course-card.png"), animations: "disabled" });
});


test("official authoring exposes README/INTRO content, muted extra files, chapter menus and inline renaming", async ({ page, mountAgentChat }) => {
  const intro = (path: string, content: string) => ({ path, content, format: "markdown" as const });
  const source = (path: string, content: string, courseFile = true) => ({ path, label: path.split("/").at(-1)!, content, courseFile });
  const defaultChapter = { id: "default", title: "Default", path: "src", intro: intro("src/INTRO.md", "# Default\n\nChapter welcome."), files: [source("src/INTRO.md", "# Default\n\nChapter welcome.")] };
  let workspace: AuthoringDraft = { root: "/tmp/chapter-course", name: "One course", style: "katas", description: "", language: "TypeScript", chapters: [defaultChapter], intro: intro("README.md", "# One course\n\nCourse welcome."), manifestSource: "name: One course\n", courseGuidance: "", rootFiles: [source("README.md", "# One course\n\nCourse welcome."), source("dojo.yaml", "name: One course\n"), source("package.json", "{}", false)], lessons: [], issues: [], courseChecks: [] };
  const creations: unknown[] = [], lessonWrites: unknown[] = [];
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method();
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/report")) return route.fulfill({ json: { report: null, root: workspace.root } });
    if (path.endsWith("/evaluation-settings")) return route.fulfill({ json: null });
    if (path.endsWith("/draft")) return route.fulfill({ json: workspace });
    if (path.endsWith("/chapters") && method === "POST") {
      creations.push(route.request().postDataJSON());
      workspace = { ...workspace, chapters: [defaultChapter, { id: "new-chapter", title: "New chapter", path: "src/new-chapter", intro: intro("src/new-chapter/INTRO.md", "# New chapter\n\nNew chapter welcome."), files: [source("src/new-chapter/INTRO.md", "# New chapter\n\nNew chapter welcome.")] }] };
      return route.fulfill({ status: 201, json: { chapterId: "new-chapter", workspace } });
    }
    if (path.endsWith("/chapters/default") && method === "PATCH") {
      workspace = { ...workspace, chapters: workspace.chapters!.map(chapter => chapter.id === "default" ? { ...chapter, title: route.request().postDataJSON().title } : chapter) };
      return route.fulfill({ json: workspace });
    }
    if (path.endsWith("/lessons") && method === "POST") {
      const input = route.request().postDataJSON(); lessonWrites.push(input);
      const chapter = workspace.chapters!.find(chapter => chapter.id === input.chapterId)!;
      const path = "src/new-chapter/001-untitled-lesson";
      const lesson = { id: "001-untitled-lesson", title: "Untitled lesson", description: "", chapter, intro: intro(`${path}/INTRO.md`, "# Untitled lesson\n\nLesson welcome."), senseiPath: `${path}/SENSEI.md`, sensei: "# Teacher guidance", hasSensei: true, evalPaths: [], checks: [], files: [source(`${path}/INTRO.md`, "# Untitled lesson\n\nLesson welcome."), source(`${path}/SENSEI.md`, "# Teacher guidance")] };
      workspace = { ...workspace, lessons: [lesson] };
      return route.fulfill({ status: 201, json: { lessonId: lesson.id, workspace } });
    }
    return route.fulfill({ status: 404 });
  });
  await mountAgentChat(page, { root: workspace.root, files: false });
  await page.goto("/authoring?workspace=ws-1&session=saved");
  const tree = page.getByRole("tree", { name: "Course files and chapters", exact: true });
  await expect(page.getByRole("tab", { name: "README.md", exact: true })).toBeVisible();
  await expect(page.locator(".ui-as-chat__details")).toContainText("Course welcome.");
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("# One course");
  const sidebar = page.locator("aside.ui-as-side");
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
  await expect(tree).toBeHidden();
  await expect(page.getByLabel("Course card preview", { exact: true })).toBeHidden();
  await expect(sidebar).toHaveCSS("width", "64px");
  await expect(page.locator(".monaco-editor[data-uri]")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Evals", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("authoring-collapsed.png"), animations: "disabled" });
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
  await expect(tree).toBeHidden();
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
  await expect(tree).toBeVisible();
  await expect(page.getByLabel("Course card preview", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "README.md", exact: true })).toBeVisible();
  await expect(page.locator(".ui-as-chat__details")).not.toContainText("Draft issues");
  await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(tree.getByRole("treeitem", { name: "Default", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New course", exact: true })).toHaveCount(0);
  await expect(tree.getByRole("treeitem", { name: "package.json", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Course actions", exact: true }).click();
  await page.getByRole("button", { name: "Show all files", exact: true }).click();
  const extra = tree.getByRole("treeitem", { name: "package.json", exact: true });
  await expect(extra).toBeVisible();
  await expect(extra.locator(":scope > div")).toHaveCSS("opacity", "0.5");
  await expect(extra.locator(":scope > div")).toHaveCSS("filter", "grayscale(1)");
  await tree.getByRole("treeitem", { name: "Chapters", exact: true }).getByRole("button", { name: "Chapters actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "New chapter", exact: true }).click();
  await expect(page).toHaveURL(/authoring\?workspace=ws-1&session=saved$/);
  const branch = tree.getByRole("treeitem", { name: "New chapter", exact: true });
  await expect(branch.getByRole("treeitem", { name: "INTRO.md", exact: true })).toBeVisible();
  await expect(page.locator(".ui-as-chat__details")).toContainText("New chapter welcome.");
  await branch.getByRole("button", { name: "New chapter actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "New lesson", exact: true }).click();
  expect(creations).toEqual([{ title: "New chapter" }]);
  expect(lessonWrites).toEqual([{ title: "Untitled lesson", chapterId: "new-chapter" }]);
  await expect(branch.getByRole("treeitem", { name: "Untitled lesson", exact: true })).toBeVisible();
  await expect(page.locator(".ui-as-chat__details")).toContainText("Lesson welcome.");
  const dot = branch.getByRole("img", { name: "Preflight: not ready", exact: true });
  await dot.hover();
  await expect(page.getByRole("tooltip")).toContainText("Preflight: not ready");
  const original = tree.getByRole("treeitem", { name: "Default", exact: true });
  await expect(original).not.toContainText("Untitled lesson");
  await original.locator(":scope > div").dblclick();
  await page.getByRole("textbox", { name: "Rename Default", exact: true }).fill("Foundations");
  await page.getByRole("textbox", { name: "Rename Default", exact: true }).press("Enter");
  await expect(tree.getByRole("treeitem", { name: "Foundations", exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("authoring-chapters.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL("/");
});

test("learners see chapter headings only after a course has been split", async ({ page }) => {
  const chapters = [{ id: "default", title: "Default", path: "src" }, { id: "advanced", title: "Advanced", path: "src/advanced" }];
  let split = false;
  const snapshot = () => ({ dojo: "chapter-course", course: { name: "Chapter course", title: "Chapter course", version: "1.0.0", chapters: split ? chapters : [chapters[0]], lessons: 2 },
    kata: "first", title: "First lesson", briefing: "Start here", code: "export const answer = 0;", starterCode: "export const answer = 0;", fileId: "solution", filePath: "src/first/kata.ts", language: "typescript",
    introduced: true, checkpointed: false, sessionId: null, model: null, harness: "codex", harnesses: ["codex"], state: "ongoing", isCurrent: true, result: null, messages: [], fragments: {},
    lessons: [{ name: "first", title: "First lesson", summary: "Start here", state: "ongoing", isCurrent: true, chapter: chapters[0] }, { name: "second", title: "Second lesson", summary: "Continue", state: "not-started", isCurrent: false, chapter: split ? chapters[1] : chapters[0] }] });
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/control/learning-sessions/chapter-run") return route.fulfill({ json: { id: "chapter-course", workspaceId: "ws-1", runId: "chapter-run", mode: "katas", kata: "first", title: "Chapter course" } });
    if (path === "/api/control/courses") return route.fulfill({ json: [{ dojo: "chapter-course", workspaceId: "ws-1", kata: "first", title: "Chapter course", sessions: [] }] });
    if (path.startsWith("/api/workspaces/")) return route.fulfill({ json: snapshot() });
    return route.fulfill({ json: {} });
  });
  await page.goto("/session/chapter-run");
  await expect(page.getByRole("group", { name: "Lessons", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Default", exact: true })).toHaveCount(0);
  split = true;
  await page.reload();
  await expect(page.getByRole("group", { name: "Chapters", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Default", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Advanced", exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("learner-chapters.png"), animations: "disabled" });
});
