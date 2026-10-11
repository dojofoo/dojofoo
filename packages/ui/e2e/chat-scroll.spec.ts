import { expect, test, type Locator } from "@playwright/test";

const bottomGap = (viewport: Locator) => viewport.evaluate(node => node.scrollHeight - node.scrollTop - node.clientHeight);

test("sending resumes following output but passive updates respect the reader", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-scrolling--multiple-choice&viewMode=story");
  const viewport = page.locator('[data-slot="scroll-area-viewport"]');
  await expect.poll(() => bottomGap(viewport)).toBeLessThan(2);
  await viewport.evaluate(node => { node.scrollTop = 200; });
  await expect.poll(() => viewport.evaluate(node => node.scrollTop)).toBe(200);
  await page.getByRole("button", { name: "Append output" }).click();
  await expect(page.getByTestId("authoring-chat-pane")).toContainText("New streamed output.");
  await expect.poll(() => viewport.evaluate(node => node.scrollTop)).toBe(200);
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Let us continue.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => bottomGap(viewport)).toBeLessThan(2);
  await page.getByRole("button", { name: "Append output" }).click();
  await expect.poll(() => bottomGap(viewport)).toBeLessThan(2);
});

test("answering a choice above later messages scrolls to the latest response", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-scrolling--multiple-choice&viewMode=story");
  const viewport = page.locator('[data-slot="scroll-area-viewport"]');
  await page.getByRole("radio", { name: "Review", exact: true }).click();
  await expect(page.getByTestId("authoring-chat-pane")).toContainText("Your answer was received.");
  await expect.poll(() => bottomGap(viewport)).toBeLessThan(2);
});

test("a free-text answer also scrolls to the latest response", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-scrolling--free-text&viewMode=story");
  const viewport = page.locator('[data-slot="scroll-area-viewport"]');
  const answer = page.getByPlaceholder("Type your answer…");
  await answer.fill("Teach me the basics.");
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByTestId("authoring-chat-pane")).toContainText("Your answer was received.");
  await expect.poll(() => bottomGap(viewport)).toBeLessThan(2);
});
