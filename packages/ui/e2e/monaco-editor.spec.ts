import { expect, test } from "@playwright/test";
import { getTypeScriptHover } from "../src/server/lesson/typescript-language-service";

const story = "/iframe.html?id=components-code-editor--workspace&viewMode=story";
const documentEnd = process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End";

test("highlights Node fileURLToPath JavaScript documentation inside a TypeScript editor", async ({ page }) => {
  const code = 'import { fileURLToPath } from "node:url";\nfileURLToPath(import.meta.url);';
  const info = getTypeScriptHover({ projectRoot: process.cwd(), filePath: "vitest.config.ts", code, position: code.lastIndexOf("fileURLToPath") + 2 });
  expect(info?.documentation).toContain("```js");
  await page.route("**/editor-fixture/files/solution/hover", (route) => route.fulfill({ json: { ...info, from: 16, to: 21 } }));
  await page.goto(story);
  await page.locator(".view-lines").getByText("greet", { exact: true }).hover();
  const hover = page.locator(".monaco-hover:visible");
  await expect(hover).toContainText("fileURLToPath");
  const example = hover.locator(".markdown-hover").nth(1).locator(".monaco-tokenized-source");
  await expect(example).toContainText("const __filename");
  await expect(example.locator("span").filter({ hasText: /^'node:url'$/ })).toHaveCSS("color", "rgb(98, 192, 115)");
});

for (const width of [1280, 600]) test(`documentation segments stay within their border at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await page.route("**/editor-fixture/files/solution/hover", (route) => route.fulfill({ json: {
    from: 16, to: 21,
    signature: "function greet(configuration: Readonly<{ learnerName: string; preferredLanguage: string; greetingPrefix: string }>): Promise<{ message: string; delivered: boolean }>",
    documentation: "Readable documentation.\n\n".repeat(35),
    tags: [
      { name: "example", text: 'const result = await greet({ learnerName: "Ada", preferredLanguage: "en", greetingPrefix: "Welcome to the course" });' },
      { name: "param", text: "configuration - The learner's greeting settings. " + "An intentionally detailed explanation. ".repeat(12) },
      { name: "returns", text: "The greeting and delivery status." },
      { name: "see", text: "https://example.com/reference" },
    ],
  } }));
  await page.goto(story);
  await page.locator(".view-lines").getByText("greet", { exact: true }).hover();
  const hover = page.locator(".monaco-hover:visible");
  await expect(hover).toContainText("References");
  await expect(page.locator(".monaco-resizable-hover:visible")).toHaveCSS("box-shadow", /6px 6px -3px/);
  const geometry = await hover.evaluate((node) => {
    const bounds = node.closest(".monaco-resizable-hover")!.getBoundingClientRect();
    return {
      right: bounds.right, bottom: bounds.bottom,
      segments: Array.from(node.querySelectorAll(".markdown-hover")).map((child) => {
        const rect = child.getBoundingClientRect();
        return { left: rect.left - bounds.left, right: rect.right - bounds.right, bottom: rect.bottom - bounds.bottom, overflow: child.scrollWidth - child.clientWidth };
      }),
      outerScroll: Array.from(node.querySelectorAll(".monaco-hover-content")).map((child) => child.scrollHeight - child.clientHeight),
      borderHeight: bounds.height,
      contentHeight: node.getBoundingClientRect().height,
    };
  });
  expect(geometry.right).toBeLessThanOrEqual(width);
  expect(geometry.bottom).toBeLessThanOrEqual(800);
  expect(geometry.borderHeight - geometry.contentHeight).toBeCloseTo(2, 0);
  for (const segment of geometry.segments) {
    expect(segment.left).toBeGreaterThanOrEqual(0);
    expect(segment.right).toBeLessThanOrEqual(0);
    expect(segment.bottom).toBeLessThanOrEqual(0);
    expect(segment.overflow).toBeLessThanOrEqual(1);
  }
  expect(geometry.outerScroll.every((overflow) => overflow <= 1)).toBe(true);
  const docs = hover.locator(".markdown-hover").nth(1);
  expect(await docs.evaluate((el) => getComputedStyle(el, "::-webkit-scrollbar").width)).toBe("6px");
  const params = hover.locator(".markdown-hover").nth(2);
  const before = await params.boundingBox();
  await expect(params.locator(".rendered-markdown")).toHaveCSS("text-overflow", "ellipsis");
  await expect(params).toHaveAttribute("title", /An intentionally detailed explanation/);
  expect(before!.height).toBeLessThan(45);
  await docs.hover();
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => docs.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect(await params.boundingBox()).toEqual(before);
  await expect(hover.locator(".scrollbar.visible")).toHaveCount(0);
  await page.screenshot({ path: `/tmp/dojo-hover-layout-${width}.png` });
});
test.beforeEach(async ({ page }) => {
  await page.route("**/editor-fixture/files/solution/hover", (route) => route.fulfill({ json: null }));
  await page.route("https://esm.sh/**", (route) => route.abort());
  await page.route("**/editor-fixture/files/solution/diagnostics", (route) => {
    const { code } = route.request().postDataJSON();
    const from = code.indexOf("unknownValue");
    return route.fulfill({ json: from < 0 ? [] : [{ from, to: from + 12, severity: "error", message: "Cannot find name 'unknownValue'.", code: 2304 }] });
  });
  await page.route("**/editor-fixture/files/solution/completions", (route) => {
    const { position } = route.request().postDataJSON();
    return route.fulfill({ json: { from: position, options: [{ label: "toUpperCase", type: "method" }] } });
  });
});

test("new symbol hovers reset scroll and long documentation uses the taller panel", async ({ page }) => {
  await page.route("**/editor-fixture/files/solution/hover", (route) => {
    const { position } = route.request().postDataJSON();
    const name = position >= 22 ? "name" : "greet";
    return route.fulfill({ json: { from: position, to: position + 1, signature: `${name}: string`,
      documentation: `Start of ${name} documentation.\n\n` + "More documentation.\n\n".repeat(60), tags: [] } });
  });
  await page.goto(story);
  await page.locator(".view-lines").getByText("greet", { exact: true }).hover();
  const hover = page.locator(".monaco-hover:visible");
  await expect(hover).toBeVisible();
  expect((await hover.boundingBox())!.height).toBeGreaterThan(300);
  const docs = hover.locator(".markdown-hover").nth(1);
  await docs.hover();
  await page.mouse.wheel(0, 900);
  const content = docs;
  await expect.poll(() => content.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.locator(".view-line").first().getByText("name", { exact: true }).hover();
  await expect(hover).toContainText("Start of name documentation.");
  await expect.poll(() => content.evaluate((node) => node.scrollTop)).toBe(0);
});

test("renders typed function documentation as formatted Markdown in a hover", async ({ page }) => {
  await page.route("**/editor-fixture/files/solution/hover", (route) => {
    const { code, filePath, position } = route.request().postDataJSON();
    expect(filePath).toBe("solution.ts");
    expect(code).toContain("function greet");
    expect(position).toBeGreaterThan(0);
    return route.fulfill({ json: { from: 16, to: 21, signature: "function greet(name: string): string",
      documentation: "Say **hello** to the learner.", tags: [{ name: "param", text: "name — The learner's name." }, { name: "returns", text: "A greeting." },
        { name: "example", text: '```js\ngreet("Ada")\n```' }, { name: "see", text: "[API reference](https://example.com/reference)" }] } });
  });
  await page.goto(story);
  await page.locator(".view-lines").getByText("greet", { exact: true }).hover();
  const hover = page.locator(".monaco-hover:visible");
  await expect(hover).toContainText("function greet(name: string): string");
  await expect(hover.locator("strong").filter({ hasText: /^hello$/ })).toBeVisible();
  await expect(hover).toContainText("@param");
  await expect(hover).toContainText("A greeting.");
  const segments = hover.locator(".markdown-hover");
  await expect(segments.first()).toHaveCSS("font-family", /Iosevka/);
  await expect(segments.first().locator(".monaco-tokenized-source")).toHaveCSS("font-size", "14px");
  await expect(segments.nth(1).locator("p").first()).toHaveCSS("font-family", /Hind/);
  for (let index = 2; index < await segments.count(); index++) {
    await expect(segments.nth(index).locator("p").first()).toHaveCSS("font-family", /Iosevka/);
    await expect(segments.nth(index)).toHaveCSS("font-size", "14px");
  }
  await expect(hover.locator("p > code").filter({ hasText: /^name$/ })).toBeVisible();
  await expect(hover.getByRole("link", { name: "API reference" })).toHaveAttribute("data-href", "https://example.com/reference");
  await expect(page.locator("body > .dojo-editor-overlays .monaco-hover:visible")).toBeVisible();
  expect((await hover.boundingBox())!.width).toBeLessThanOrEqual(520);
  await expect(hover.locator(".monaco-tokenized-source").first()).toHaveCSS("white-space", "pre-wrap");
  const example = hover.locator(".monaco-tokenized-source").filter({ hasText: 'greet("Ada")' });
  await expect(example).toBeVisible();
  await expect(example).toHaveCSS("border-top-width", "1px");
  await expect(example.locator("span").filter({ hasText: /^"Ada"$/ })).toHaveCSS("color", "rgb(98, 192, 115)");
  await page.locator("nav").getByRole("button", { name: "DOJO.md", exact: true }).click();
  await expect(page.locator("body > .dojo-editor-overlays")).toHaveCount(1);
  await expect(page.locator(".monaco-hover:visible")).toHaveCount(0);
});

test("loads locally with Shiki's Vercel theme and matching Iosevka gutters", async ({ page }) => {
  const remote: string[] = [];
  page.on("request", (request) => { if (request.url().includes("esm.sh")) remote.push(request.url()); });
  await page.goto(story);
  await expect(page.locator(".monaco-editor").first()).toBeVisible();
  await expect(page.locator(".monaco-editor-background").first()).toHaveCSS("background-color", "rgb(26, 26, 26)");
  await expect(page.locator(".view-lines")).toHaveCSS("font-family", /Iosevka/);
  await expect(page.locator(".margin-view-overlays .line-numbers").first()).toHaveCSS("font-family", /Iosevka/);
  await expect(page.locator(".margin-view-overlays .line-numbers").first()).toHaveCSS("font-size", "16.5px");
  await expect(page.locator(".view-line").first().locator("span span").first()).toHaveCSS("color", "rgb(255, 77, 141)");
  expect(remote).toEqual([]);
});

test("edits, undoes, saves the focused file, resets and isolates files", async ({ page }) => {
  await page.goto(story);
  const editor = page.getByRole("textbox", { name: "Code editor" });
  const source = page.locator('[aria-label="Current source"]');
  await editor.focus();
  await page.keyboard.press(documentEnd);
  await page.keyboard.insertText("// learner edit");
  await expect(source).toContainText("learner edit");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(source).not.toContainText("learner edit");
  await page.getByRole("button", { name: "DOJO.md", exact: true }).click();
  await expect(source).toContainText("# Practice");
  await editor.focus();
  await page.keyboard.press(documentEnd);
  await page.keyboard.insertText("A teaching note");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator('[aria-label="Saved source"]')).toContainText("DOJO.md: # Practice");
  await expect(page.locator('[aria-label="Saved source"]')).toContainText("A teaching note");
  await page.getByRole("button", { name: "solution.ts", exact: true }).click();
  await expect(source).not.toContainText("teaching note");
  await page.getByRole("button", { name: "DOJO.md", exact: true }).click();
  await expect(source).toContainText("teaching note");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(source).not.toContainText("teaching note");
});

test("renders all languages, coverage and repeatable line flashes", async ({ page }) => {
  await page.goto(story);
  await expect(page.locator(".dojo-line-covered")).toHaveCount(2);
  await expect(page.locator(".dojo-line-failed")).toHaveCount(1);
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Highlight line 2" }).click();
    await expect(page.locator(".dojo-line-flash")).toHaveCount(1);
    await expect(page.locator(".dojo-line-flash")).toHaveCount(0);
  }
  for (const file of ["dojo.yaml", "package.json", "solution.py", "solution.js", "DOJO.md"]) {
    await page.getByRole("button", { name: file, exact: true }).click();
    await expect(page.locator(`.dojo-code-editor[data-file-path="${file}"] .view-line`).first()).toBeVisible();
    await expect(page.locator(".dojo-code-editor").getByRole("alert")).toHaveCount(0);
  }
});

test("scrolls long YAML inside its fixed viewport", async ({ page }) => {
  await page.goto(story);
  await page.getByRole("button", { name: "long.yaml", exact: true }).click();
  const frame = page.locator(".dojo-code-editor[data-file-path]");
  const before = await frame.boundingBox();
  await page.getByRole("textbox", { name: "Code editor" }).focus();
  await page.keyboard.press(documentEnd);
  await expect(page.locator(".view-lines")).toContainText("item299");
  const slider = page.locator(".monaco-editor .scrollbar.vertical > .slider").first();
  await expect(slider).toHaveCSS("border-radius", "0px");
  await expect(slider).toHaveCSS("background-color", "rgba(128, 128, 128, 0.5)");
  expect(await frame.boundingBox()).toEqual(before);
});

test("uses project completions and diagnostic hover, clearing obsolete errors", async ({ page }) => {
  await page.goto(story);
  await page.getByRole("textbox", { name: "Code editor" }).focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("const a = unknownValue;");
  await expect(page.locator(".squiggly-error")).toBeVisible();
  await page.locator(".view-lines").getByText("unknownValue", { exact: true }).hover();
  await expect(page.locator(".monaco-hover:visible")).toContainText("Cannot find name 'unknownValue'.");
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText('const a = "hello"');
  await page.keyboard.type(".");
  await expect(page.locator(".suggest-widget")).toBeVisible();
  await expect(page.locator(".suggest-widget")).toContainText("toUpperCase");
  await expect(page.locator(".squiggly-error")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(page.locator('[aria-label="Current source"]')).toContainText("toUpperCase");
});

test("keeps the website preview read-only", async ({ page }) => {
  await page.goto(story + "&args=readOnly:true");
  const source = page.locator('[aria-label="Current source"]');
  const original = await source.textContent();
  await page.getByRole("textbox", { name: "Code editor" }).focus();
  await page.keyboard.type("should not be inserted");
  await expect(source).toHaveText(original!);
});

test("folds and unfolds a function using native Monaco controls", async ({ page }) => {
  await page.goto(story);
  const fold = page.locator(".codicon-folding-expanded").first();
  await fold.hover();
  await fold.click();
  await expect(page.locator(".codicon-folding-collapsed")).toHaveCount(1);
  await page.locator(".codicon-folding-collapsed").click();
  await expect(page.locator(".view-lines")).toContainText("return");
});
