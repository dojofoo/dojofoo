import { expect, test } from "@playwright/test";
import { mountAgentChat } from "./agent-chat.fixture";

test("authoring previews share the learner typography and keep unsupported diagrams out", async ({ page }) => {
  const source = "# Teaching notes\n\nDescribe one observable outcome.\n";
  const manifest = "name: Preview course\ndescription: A focused outcome\nkatas:\n  - name: first\n    description: Practice one thing\n";
  const writes: string[] = [];
  const json = { title: "Practice", attempts: 2, enabled: true, nested: [null, "Keep this"] };
  const workspace = { root: "/tmp/preview-course", style: "katas", name: "Preview course", description: "A focused outcome", language: "TypeScript",
    manifestSource: manifest, courseGuidance: source, rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: manifest },
      { path: "DOJO.md", label: "DOJO.md", content: source },
      { path: "example.json", label: "example.json", content: JSON.stringify(json) },
      { path: "invalid.json", label: "invalid.json", content: "{" }], lessons: [], issues: [], courseChecks: [] };
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [
      { type: "html", html: "<p>Describe one observable outcome.</p>" },
      { type: "diagram", source: "graph TD; A[Unsupported diagram] --> B[Hidden]" },
    ] } });
    if (request.method() !== "GET") writes.push(path);
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: workspace });
    return route.fulfill({ status: 404 });
  });
  const agent = await mountAgentChat(page, { root: "/tmp/preview-course", files: false });
  await page.goto("/authoring?session=saved");
  await page.getByRole("button", { name: "Switch to preview", exact: true }).click();
  const preview = page.getByTestId("authoring-workspace");
  await expect(preview.locator(".ui-lb__title")).toHaveText("Preview course");
  await expect(preview).toContainText("Practice one thing");
  await expect(preview.locator(".ui-lb__title")).toHaveCSS("font-size", "27px");
  await page.screenshot({ path: test.info().outputPath("authoring-manifest-preview.png"), animations: "disabled" });
  await page.getByRole("navigation", { name: "Main menu" }).getByRole("button", { name: "DOJO.md", exact: true }).click();
  await expect(preview).toContainText("Describe one observable outcome.");
  await expect(preview.locator(".mermaid, [data-streamdown='mermaid-block']")).toHaveCount(0);
  await expect(preview.locator(".teaching-markdown p")).toHaveCSS("line-height", "24px");
  await page.screenshot({ path: test.info().outputPath("authoring-markdown-preview.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Course actions", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Show all files", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Main menu" });
  await navigation.getByRole("button", { name: "example.json", exact: true }).click();
  const code = preview.locator("pre.ui-code code");
  await expect(code).toHaveText(JSON.stringify(json, null, 2) + "\n");
  await expect.poll(() => code.locator(".line span").count()).toBeGreaterThan(0);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await preview.getByRole("button", { name: "Copy code", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(JSON.stringify(json, null, 2));
  await page.screenshot({ path: test.info().outputPath("authoring-json-preview.png"), animations: "disabled" });
  const darkToken = await code.locator(".line span").first().evaluate(node => getComputedStyle(node).color);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await expect.poll(() => code.locator(".line span").first().evaluate(node => getComputedStyle(node).color)).not.toBe(darkToken);
  await page.screenshot({ path: test.info().outputPath("authoring-json-preview-light.png"), animations: "disabled" });
  await navigation.getByRole("button", { name: "invalid.json", exact: true }).click();
  await expect(preview.getByRole("alert")).not.toBeEmpty();
  await navigation.getByRole("button", { name: "DOJO.md", exact: true }).click();
  await expect(preview.locator(".teaching-markdown p")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Switch to code", exact: true })).toBeInViewport();
  const tabs = await page.getByRole("tablist", { name: "Authoring workspace", exact: true }).boundingBox();
  const actions = await page.getByRole("toolbar", { name: "Authoring file actions", exact: true }).boundingBox();
  expect(actions!.y).toBeGreaterThanOrEqual(tabs!.y + tabs!.height);
  const alignment = await page.getByRole("button", { name: "Refresh", exact: true }).evaluate(node => {
    const icon = node.querySelector("svg")!.getBoundingClientRect();
    const label = node.querySelector(".ui-button__label")!.getBoundingClientRect();
    return Math.abs(icon.y + icon.height / 2 - label.y - label.height / 2);
  });
  expect(alignment).toBeLessThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("authoring-markdown-preview-phone.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Switch to code", exact: true }).click();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("# Teaching notes");
  await page.getByRole("button", { name: "Switch to preview", exact: true }).click();
  await expect(preview.locator(".teaching-markdown p")).toBeVisible();
  expect(writes).toEqual([]);
});
