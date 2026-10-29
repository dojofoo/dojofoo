import { expect, test } from "@playwright/test";

test("chat code and check logs share UIX surfaces while retaining copy, line references and report text", async ({ page, context }) => {
  const writes: string[] = [];
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/files/solution/diagnostics")) {
      expect(request.postDataJSON()).toMatchObject({ code: "export const answer = 0;", filePath: "first.ts" });
      return route.fulfill({ json: [] });
    }
    if (request.method() !== "GET" && path !== "/api/teaching/preview") writes.push(path);
    if (path === "/api/control/courses") return route.fulfill({ json: [{ workspaceId: "output-workspace", dojo: "output", kata: "first", mode: "katas", workspaceName: "Output", selected: true, sessionId: "owned", sessions: [{ lessonId: "first", sessionId: "owned" }] }] });
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [{ type: "html", html: "<p>An authored note.</p>" }, { type: "diagram", source: "graph LR\n A --> B" }] } });
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: {
      dojo: "output", kata: "first", title: "First lesson", briefing: "", code: "export const answer = 0;", starterCode: "export const answer = 0;", fileId: "solution", filePath: "first.ts", language: "typescript",
      introduced: true, checkpointed: false, sessionId: "owned", harness: "opencode", harnesses: ["opencode"], model: null, state: "ongoing", isCurrent: true, result: null, fragments: { note: "An authored note." },
      messages: [{ id: "output", role: "assistant", parts: [
        { type: "text", content: "Try [highlight:L1].\n\n```tsx\nconst View = () => <button>Try it</button>;\n```" },
        { type: "tool-call", id: "check", name: "dojo_lesson_verify", arguments: "{}", input: {}, state: "complete", output: { passed: 1, failed: 1, total: 2, tests: [
          { name: "keeps the input", status: "passed", suite: [], failureMessages: [] },
          { name: "handles an empty list", status: "failed", suite: [], failureMessages: ["Expected [] but received undefined. Return an empty list when there are no positive values; keep the original input unchanged."] },
        ] } },
        { type: "ui-resource", resource: { uri: "dojo://lessons/note", text: "note" } },
      ] }], lessons: [{ name: "first", title: "First lesson", summary: "Try it", state: "ongoing", isCurrent: true }],
    } });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/course/output-workspace/output/lesson/first");
  const chat = page.getByTestId("chat-pane");
  const block = chat.locator("pre.ui-code").filter({ hasText: "const View" });
  await expect(block).toBeVisible();
  await expect(block.locator("span[style*='color']").first()).toBeVisible();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
  await block.getByRole("button", { name: "Copy code", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("const View = () => <button>Try it</button>;");
  const reference = chat.getByRole("button", { name: "[highlight:L1]", exact: true });
  const referenceColors = await reference.evaluate(node => {
    const probe = document.createElement("span"); probe.style.color = "var(--brand)"; node.append(probe);
    const result = { actual: getComputedStyle(node).color, expected: getComputedStyle(probe).color }; probe.remove(); return result;
  });
  expect(referenceColors.actual).toBe(referenceColors.expected);
  await reference.click();
  await expect(page.locator(".ui-ed-line-flash").first()).toBeVisible();
  await chat.getByRole("button", { name: /^Worked/ }).click();
  const check = chat.getByRole("button", { name: /^dojo_lesson_verify/ });
  await expect(check.locator("xpath=..")).toHaveAttribute("data-status", "success");
  if (await check.getAttribute("aria-expanded") === "false") await check.click();
  const output = chat.getByRole("region", { name: "1/2 lesson checks passed", exact: true });
  await expect(output).toBeVisible();
  await expect(output).toContainText("✓ keeps the input");
  await expect(output).toContainText("× handles an empty list");
  await expect(output).toContainText("Expected [] but received undefined");
  await expect(chat.locator('[data-slot="terminal-block"]')).toHaveCount(0);
  await expect(chat.getByText("An authored note.", { exact: true })).toBeVisible();
  await expect(chat.locator(".mermaid, [data-streamdown='mermaid-block']")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("chat-output-desktop.png"), animations: "disabled" });
  const darkTokenColor = await block.locator("span[style*='color']").first().evaluate(node => getComputedStyle(node).color);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await expect.poll(() => block.locator("span[style*='color']").first().evaluate(node => getComputedStyle(node).color)).not.toBe(darkTokenColor);
  await page.screenshot({ path: test.info().outputPath("chat-output-light.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Show chat", exact: true }).click();
  await output.scrollIntoViewIfNeeded();
  expect(await output.locator("pre").evaluate(node => getComputedStyle(node).whiteSpace)).toBe("pre-wrap");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("chat-output-phone.png"), animations: "disabled" });
  expect(writes).toEqual([]);
});
