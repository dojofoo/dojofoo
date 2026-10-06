import { expect, test } from "@playwright/test";

const story = "/iframe.html?id=components-teaching-content--lesson&viewMode=story";

test("lesson content consumes production-compiled API fixtures and isolates file changes", async ({ page }) => {
  await page.goto("/iframe.html?id=components-teaching-content--authored-preview&viewMode=story");
  await expect(page.getByRole("heading", { name: "Reading a value" })).toBeVisible();
  await page.getByRole("button", { name: "Second file" }).click();
  await expect(page.getByRole("heading", { name: "Second file" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reading a value" })).toHaveCount(0);
  await page.getByRole("button", { name: "Lesson file" }).click();
  await expect(page.getByRole("heading", { name: "Reading a value" })).toBeVisible();
});

test("preview errors are visible instead of leaving an endless loader", async ({ page }) => {
  await page.goto("/iframe.html?id=components-teaching-content--preview-error&viewMode=story");
  await expect(page.getByRole("alert")).toContainText("unexpected TypeScript error");
});

test("authored content retains its theme, sources, formulas, diagrams and list spacing", async ({ page }) => {
  await page.goto(story);
  await expect(page.getByRole("heading", { name: "Reading a value" })).toBeVisible();
  await expect(page.locator("pre.twoslash").first()).toHaveCSS("background-color", "rgb(26, 26, 26)");
  await expect(page.getByRole("link", { name: "MDN reference" })).toHaveAttribute("href", /developer.mozilla.org/);
  await expect(page.locator(".twoslash-tag-annotate-line")).toHaveCSS("color", "rgb(27, 166, 115)");
  await expect(page.locator(".twoslash-error-line")).toBeVisible();
  await expect(page.locator(".katex-display")).toBeVisible();
  await page.getByRole("button", { name: "Download diagram" }).scrollIntoViewIfNeeded();
  await expect(page.locator("svg").filter({ hasText: "Predict" }).first()).toBeVisible();
  await expect(page.locator(".teaching-markdown ol")).toHaveCSS("padding-left", "28px");
});

test("Twoslash documentation is readable with mouse and keyboard", async ({ page }) => {
  await page.goto(story);
  const token = page.locator(".twoslash-hover", { hasText: "toUpperCase" }).first();
  await token.hover();
  const popup = page.getByRole("tooltip");
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("string");
  await page.mouse.move(0, 0);
  await token.focus();
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Converts all the alphabetic characters");
});

test("Magic Move advances, reverses and settles after repeated navigation", async ({ page }) => {
  await page.goto(story);
  const example = page.getByRole("figure", { name: "Animated code example" });
  await expect(example.getByRole("button", { name: "Previous" })).toBeDisabled();
  await example.getByRole("button", { name: "Next" }).click();
  await expect(example).toContainText("Step 2 of 3");
  await expect(example.locator("pre")).toContainText("const doubled = score * 2;");
  await example.getByRole("button", { name: "Next" }).click();
  await expect(example.getByRole("button", { name: "Next" })).toBeDisabled();
  await example.getByRole("button", { name: "Previous" }).click();
  await example.getByRole("button", { name: "Previous" }).click();
  await expect(example).toContainText("Step 1 of 3");
  await expect(example.locator("pre")).toHaveText("const score = 2;");
});

test("Magic Move respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(story);
  const example = page.getByRole("figure", { name: "Animated code example" });
  await example.getByRole("button", { name: "Next" }).click();
  await expect(example.locator("pre")).toHaveText("const score = 2;\nconst doubled = score * 2;", { useInnerText: true });
  await expect(example.locator(".shiki-magic-move-move, .shiki-magic-move-enter-active")).toHaveCount(0);
});
