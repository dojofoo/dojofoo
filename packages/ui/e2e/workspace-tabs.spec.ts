import { expect, test } from "@playwright/test";

test("shared scroll areas and native scrollbars have square gray thumbs with compact chat sizing", async ({ page }) => {
  await page.goto("/iframe.html?id=components-scrollbars--surfaces&viewMode=story");
  for (const [name, width] of [["standard-scroll", "10px"], ["compact-scroll", "6px"]] as const) {
    const root = page.getByTestId(name);
    const thumb = root.locator('[data-slot="scroll-area-thumb"]');
    await expect(thumb).toHaveCSS("width", width);
    await expect(thumb).toHaveCSS("border-radius", "0px");
    await expect(thumb).toHaveCSS("background-color", "rgba(128, 128, 128, 0.5)");
    await root.hover();
    await page.mouse.wheel(0, 300);
    await expect.poll(() => root.locator('[data-slot="scroll-area-viewport"]').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  }
  const native = page.getByTestId("native-scroll");
  expect(await native.evaluate((el) => getComputedStyle(el, "::-webkit-scrollbar").width)).toBe("6px");
  expect(await native.evaluate((el) => getComputedStyle(el, "::-webkit-scrollbar-thumb").borderRadius)).toBe("0px");
});

test("authoring opens, closes, reopens unsaved drafts and reorders tabs", async ({ page }) => {
  await page.goto("/iframe.html?id=components-workspace-files--authoring&viewMode=story");
  await expect(page.getByRole("tab")).toHaveCount(1);
  await page.getByRole("textbox", { name: "File content" }).fill("unsaved course name");
  await page.getByRole("button", { name: "Open DOJO.md", exact: true }).click();
  await expect(page.getByRole("textbox")).toHaveValue("# Course");
  await page.getByRole("button", { name: "Open SENSEI.md" }).click();
  await page.getByRole("tab", { name: "SENSEI.md" }).press("Alt+ArrowLeft");
  await expect(page.getByRole("tab")).toHaveText(["dojo.yaml", "SENSEI.md", "DOJO.md"]);
  await page.getByRole("tab", { name: "SENSEI.md" }).press("Alt+ArrowRight");
  await expect(page.getByRole("tab")).toHaveText(["dojo.yaml", "DOJO.md", "SENSEI.md"]);
  await page.getByRole("tab", { name: "SENSEI.md" }).dragTo(page.getByRole("tab", { name: "dojo.yaml" }));
  await expect(page.getByRole("tab")).toHaveText(["SENSEI.md", "dojo.yaml", "DOJO.md"]);
  await page.getByRole("button", { name: "Close dojo.yaml", exact: true }).click();
  await page.getByRole("button", { name: "Open dojo.yaml", exact: true }).click();
  await expect(page.getByRole("textbox")).toHaveValue("unsaved course name");
  for (const path of ["lesson/SENSEI.md", "DOJO.md", "dojo.yaml"]) await page.getByRole("button", { name: `Close ${path}`, exact: true }).click();
  await expect(page.getByText("No open files")).toBeVisible();
  await page.getByRole("button", { name: "Open dojo.yaml", exact: true }).click();
  await expect(page.getByRole("textbox")).toHaveValue("unsaved course name");
});

test("learning tabs cannot be opened, closed or reordered", async ({ page }) => {
  await page.goto("/iframe.html?id=components-workspace-files--learning&viewMode=story");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Close|Open/ })).toHaveCount(0);
  await expect(page.locator('[draggable="true"]')).toHaveCount(0);
  await page.getByRole("tab", { name: "Tests" }).click();
  await page.getByRole("tab", { name: "Tests" }).press("Alt+ArrowLeft");
  await expect(page.getByRole("tab")).toHaveText(["solution.ts", "Tests"]);
  await expect(page.getByRole("tab", { name: "Tests" })).toHaveAttribute("aria-selected", "true");
});

test("dragging shows the insertion edge and moves tabs in both directions", async ({ page }) => {
  await page.goto("/iframe.html?id=components-workspace-files--authoring&viewMode=story");
  await page.getByRole("button", { name: "Open DOJO.md", exact: true }).click();
  await page.getByRole("button", { name: "Open SENSEI.md" }).click();

  async function drag(source: string, target: string, side: "left" | "right") {
    const from = await page.getByRole("tab", { name: source, exact: true }).boundingBox();
    const to = await page.locator(`[data-file-tab="${target}"]`).boundingBox();
    if (!from || !to) throw new Error("Missing tab geometry");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    const x = side === "left" ? to.x + 3 : to.x + to.width - 3;
    const y = to.y + to.height / 2;
    await page.mouse.move(x, y, { steps: 12 });
    await page.mouse.move(x, y);
    const marker = page.getByTestId("tab-insertion-marker");
    await expect(marker).toBeVisible();
    await expect(page.getByRole("tab", { name: source, exact: true }).locator("..")).toHaveCSS("opacity", "0.4");
    const bounds = await marker.boundingBox();
    expect(Math.abs(bounds!.x - (side === "left" ? to.x : to.x + to.width - 3))).toBeLessThan(4);
    await page.mouse.up();
    await expect(marker).toHaveCount(0);
    await expect(page.getByRole("tab", { name: source, exact: true }).locator("..")).toHaveCSS("opacity", "1");
  }

  await drag("SENSEI.md", "dojo.yaml", "left");
  await expect(page.getByRole("tab")).toHaveText(["SENSEI.md", "dojo.yaml", "DOJO.md"]);
  await drag("SENSEI.md", "DOJO.md", "right");
  await expect(page.getByRole("tab")).toHaveText(["dojo.yaml", "DOJO.md", "SENSEI.md"]);
  await drag("DOJO.md", "dojo.yaml", "left");
  await expect(page.getByRole("tab")).toHaveText(["DOJO.md", "dojo.yaml", "SENSEI.md"]);
  await drag("DOJO.md", "dojo.yaml", "right");
  await expect(page.getByRole("tab")).toHaveText(["dojo.yaml", "DOJO.md", "SENSEI.md"]);
});
test("authoring course menu filters files and keeps nested files selectable", async ({ page }) => {
  await page.goto("/iframe.html?id=components-authoring-sidebar--file-filter&viewMode=story");
  const course = page.getByRole("region", { name: "Course file browser" });
  await expect(course.getByText("dojo.yaml", { exact: true })).toBeVisible();
  await expect(course.getByText("package.json", { exact: true })).toHaveCount(0);
  await expect(page.getByText("eval.yaml", { exact: true })).toHaveCount(0);
  await course.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Show all files" }).click();
  await expect(course.getByText("package.json", { exact: true })).toBeVisible();
  await expect(page.getByText("eval.yaml", { exact: true })).toBeVisible();
  await course.getByText(".agents", { exact: true }).click();
  await course.getByText("skills", { exact: true }).click();
  await course.getByText("course", { exact: true }).click();
  await course.getByText("SKILL.md", { exact: true }).click();
  await expect(page.getByLabel("Selected file")).toHaveText(".agents/skills/course/SKILL.md");
  await course.hover();
  await page.getByRole("button", { name: "Course actions", exact: true }).click();
  await page.getByRole("button", { name: "Show only course files", exact: true }).click();
  await expect(course.getByText("package.json", { exact: true })).toHaveCount(0);
  await page.getByText("kata.ts", { exact: true }).click();
  await expect(page.getByLabel("Selected file")).toHaveText("src/001-first/kata.ts");
});
