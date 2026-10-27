import { expect, test } from "@playwright/test";

for (const freeText of [false, true]) test(`chat prompts keep their native answer payload with UIX presentation (text=${freeText})`, async ({ page }) => {
  const answers: unknown[] = [];
  const question = { id: "decision", title: "What should we try?", options: freeText ? [] : [{ id: "example", title: "A small example" }, { id: "review", title: "Review the code" }] };
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/control/courses") return route.fulfill({ json: [{ workspaceId: "prompt-workspace", dojo: "prompts", kata: "first", mode: "katas", workspaceName: "Prompts", selected: true, sessionId: "owned", sessions: [{ lessonId: "first", sessionId: "owned" }] }] });
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/messages") && request.method() === "POST") { answers.push(request.postDataJSON()); return route.fulfill({ json: { ok: true } }); }
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: {
      dojo: "prompts", kata: "first", title: "First lesson", briefing: "", code: "export const answer = 0;", starterCode: "export const answer = 0;", fileId: "solution", filePath: "first.ts", language: "typescript",
      introduced: true, checkpointed: false, sessionId: "owned", harness: "opencode", harnesses: ["opencode"], model: null,
      state: "ongoing", isCurrent: true, result: null, fragments: {},
      messages: [{ id: "question", role: "assistant", parts: [{ type: "text", content: "Choose a starting point." }, { type: "tool-call", id: "ask", name: "elicitation", arguments: "{}", input: { questions: [question] }, state: "input-complete" }] }],
      lessons: [{ name: "first", title: "First lesson", summary: "Try it", state: "ongoing", isCurrent: true }],
    } });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/course/prompt-workspace/prompts/lesson/first");
  const card = page.getByTestId("sensei-streaming-message").locator(".bg-card.border");
  await expect(card.getByRole("heading", { name: question.title, exact: true })).toBeVisible();
  const radius = await card.evaluate(node => getComputedStyle(node).borderRadius);
  expect(radius).not.toBe("0px");
  if (freeText) {
    const finish = card.getByRole("button", { name: /^Finish/ });
    expect(await finish.getAttribute("class")).toContain("ui-button");
    await expect(finish).toBeDisabled();
    await card.getByRole("textbox").fill("Try one small example.");
    await expect(finish).toBeEnabled();
    await page.screenshot({ path: test.info().outputPath("question-text-desktop.png"), animations: "disabled" });
    await finish.click();
    await expect.poll(() => answers).toEqual([{ answers: { decision: ["Try one small example."] } }]);
    await expect(card.locator("textarea")).toHaveValue("Try one small example.");
  } else {
    const choice = card.getByRole("radio", { name: /A small example/ });
    await choice.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => answers).toEqual([{ answers: { decision: ["example"] } }]);
    await expect(card.locator('[role="radio"][aria-checked="true"]:not([aria-hidden="true"])')).toContainText("A small example");
  }
  const selected = freeText ? card.locator("textarea") : card.getByText("1", { exact: true });
  const color = await selected.evaluate(node => {
    const probe = document.createElement("span");
    probe.style.color = "var(--brand)";
    node.parentElement!.append(probe);
    const result = { actual: getComputedStyle(node).color, expected: getComputedStyle(probe).color };
    probe.remove();
    return result;
  });
  expect(color.actual).toBe(color.expected);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Show chat", exact: true }).click();
  await expect(card).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("question-phone.png"), animations: "disabled" });
  expect(answers).toHaveLength(1);
});
