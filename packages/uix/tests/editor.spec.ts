import { expect, test } from "@playwright/test";

const editorStory = "/iframe.html?id=components-organisms-editor--playground&viewMode=story";

test("component stories have atomic design groups", async ({ request }) => {
  const { entries } = await (await request.get("/index.json")).json();
  const components = Object.values(entries) as { title: string }[];
  expect(components.filter(entry => entry.title.startsWith("Components/")).every(entry =>
    /^Components\/(Atoms|Molecules|Organisms)\//.test(entry.title))).toBe(true);
  expect(components.some(entry => entry.title === "Components/Organisms/Editor")).toBe(true);
});

test("editor keeps edits and undo across highlighted files and test results", async ({ page }, testInfo) => {
  await page.goto(editorStory);
  const code = page.getByRole("textbox", { name: "Code editor", exact: true });
  await expect(code).toBeVisible();
  await code.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n// retained edit");
  await page.getByRole("tab", { name: "kata.test.ts", exact: true }).click();
  await expect(page.locator(".view-lines")).toContainText("expect(positive");
  await page.getByRole("tab", { name: /Test results/ }).click();
  await expect(page.getByRole("region", { name: "Test results", exact: true })).toBeVisible();
  const results = page.getByRole("region", { name: "Test results", exact: true });
  await expect(results.getByRole("grid")).toBeVisible();
  await expect(results.locator("header, footer, thead, [data-slot='collapsible']")).toHaveCount(0);
  await expect(results.getByRole("checkbox")).toHaveCount(0);
  await expect(results.getByRole("img", { name: "Passed", exact: true })).toHaveCount(2);
  await expect(results.getByRole("img", { name: "Failed", exact: true })).toHaveCount(1);
  await expect(results.getByRole("img", { name: "Skipped", exact: true })).toHaveCount(1);
  await expect(results.locator("pre.shiki code").first()).toContainText("[3, 8]");
  await expect(results.locator("pre.shiki code").nth(1)).toContainText("[3, 0, 8]");
  await expect(results.locator("pre.shiki code span[style]").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("editor-test-results.png") });
  await page.getByRole("button", { name: "kata.ts:9", exact: true }).click();
  await expect(page.locator(".ui-ed-line-flash").first()).toBeVisible();
  await expect(page.locator(".view-lines")).toContainText("// retained edit");
  await page.getByRole("button", { name: "Undo edit" }).click();
  await expect(page.locator(".view-lines")).not.toContainText("// retained edit");
  await page.getByRole("button", { name: "Highlight lines" }).click();
  await expect(page.locator(".ui-ed-line-flash").first()).toBeVisible();
  await expect(page.locator(".ui-ed-number-covered").first()).toBeVisible();
  await expect(page.locator(".ui-ed-number-failed").first()).toBeVisible();
});

test("JSDoc works without supplying a documentation endpoint", async ({ page }) => {
  await page.goto(editorStory);
  const declaration = page.locator(".view-lines .view-line").filter({ hasText: "export function positive" });
  await declaration.getByText("positive", { exact: true }).hover();
  const hover = page.getByRole("tooltip").filter({ hasText: "Keep positive readings" });
  await expect(hover).toContainText("A list of measurements.");
  await expect(hover.locator(".monaco-tokenized-source").last()).toContainText("positive");
  await expect(hover.getByRole("link")).toHaveAttribute("data-href", /developer.mozilla.org/);
});

test("learner switches between source and detailed test output", async ({ page }) => {
  await page.goto("/iframe.html?id=pages-dojo--learner-kata&viewMode=story");
  await page.getByRole("tab", { name: /Test results/ }).click();
  await expect(page.getByRole("region", { name: "Test results", exact: true })).toBeVisible();
  await expect(page.getByText("Sample output from the last check.")).toBeVisible();
  await page.getByRole("tab", { name: "kata.ts", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Code editor", exact: true })).toBeVisible();
});

test("TypeScript diagnostics and completion follow edits", async ({ page }) => {
  await page.goto(editorStory);
  const code = page.getByRole("textbox", { name: "Code editor", exact: true });
  await code.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\nconst wrong: string = 1;\nconst readings = [1, 2];\n");
  await expect(page.locator(".squiggly-error").first()).toBeVisible();
  await page.keyboard.type("readings.");
  await expect(page.locator(".suggest-widget.visible")).toContainText("filter");
});

for (const mode of ["light", "dark"]) test(`test output follows the window theme in ${mode}`, async ({ page }, testInfo) => {
  await page.goto(`${editorStory}&globals=theme:${mode}`);
  await page.getByRole("tab", { name: /Test results/ }).click();
  const results = page.getByRole("region", { name: "Test results", exact: true });
  const windowColor = await page.locator(".ui-ed__tabs").evaluate(element => getComputedStyle(element).backgroundColor);
  await expect(results).toHaveCSS("background-color", windowColor);
  await expect(page.locator(".ui-ed__status")).toHaveCount(0);
  await expect(results.getByRole("img", { name: "Skipped", exact: true })).toBeVisible();
  await expect(results.locator("pre.shiki").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`test-results-${mode}.png`) });
});
