import { expect, test } from "@playwright/test";
const story = "/iframe.html?id=components-tree-view--files&viewMode=story";

test("authoring can rename a lesson without losing its selected file", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=components-authoring-sidebar--file-filter&viewMode=story",
  );
  await page.getByRole("button", { name: "kata.ts", exact: true }).click();
  await page
    .getByRole("treeitem", { name: "First lesson", exact: true })
    .hover();
  await page
    .getByRole("button", { name: "Rename First lesson", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Renamed lesson");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(
    page.getByRole("treeitem", { name: "Renamed lesson", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("treeitem", { name: "kata.ts", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Selected file")).toHaveText(
    "src/001-first/kata.ts",
  );
});

test("folders unfold in place, preserve siblings, and slide a single selection", async ({
  page,
}) => {
  await page.goto(story);
  const src = page.getByRole("treeitem", { name: "src", exact: true });
  const top = (await src.locator(":scope > .dojo-tree-row").boundingBox())!.y;
  await page.getByRole("button", { name: "lib", exact: true }).click();
  await expect(
    page.getByRole("treeitem", { name: "utils.ts", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("treeitem", { name: "app", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  expect((await src.locator(":scope > .dojo-tree-row").boundingBox())!.y).toBe(
    top,
  );
  await page.getByRole("button", { name: "utils.ts", exact: true }).click();
  await expect(
    page.getByRole("treeitem", { name: "utils.ts", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".dojo-tree-selection")).toHaveCount(1);
  await expect(page.locator(".dojo-tree-guide-active")).toHaveCount(1);
  await page.getByRole("button", { name: "src", exact: true }).click();
  await expect(
    page.getByRole("treeitem", { name: "utils.ts", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".dojo-tree-selection")).toHaveCount(0);
  await page.getByRole("button", { name: "src", exact: true }).click();
  await expect(
    page.getByRole("treeitem", { name: "utils.ts", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("supports roving focus, tree keys, empty folders and type-ahead", async ({
  page,
}) => {
  await page.goto(story);
  const item = (name: string) =>
    page.getByRole("treeitem", { name, exact: true });
  await item("src").focus();
  await page.keyboard.press("ArrowRight");
  await expect(item("app")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(item("layout.tsx")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(item("page.tsx")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(item("app")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(item("app")).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("End");
  await expect(item("README.md")).toBeFocused();
  await page.keyboard.press("p");
  await expect(item("public")).toBeFocused();
  await page.keyboard.press("p");
  await expect(item("package.json")).toBeFocused();
  await item("empty").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(item("empty")).toBeFocused();
  await expect(page.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
});

test("controlled collapse restores a visible tab stop and reduced motion disables transitions", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(
    "/iframe.html?id=components-tree-view--controlled&viewMode=story",
  );
  await page.getByRole("button", { name: "layout.tsx", exact: true }).click();
  await expect(page.getByLabel("Selected file")).toHaveText("layout");
  await page.getByRole("button", { name: "Collapse externally" }).click();
  await expect(
    page.getByRole("treeitem", { name: "src", exact: true }),
  ).toHaveAttribute("tabindex", "0");
  await expect(page.locator(".dojo-tree-collapse").first()).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await page.getByRole("button", { name: "src", exact: true }).click();
  await expect(page.locator(".dojo-tree-children").first()).toHaveCSS(
    "overflow",
    "visible",
  );
});
