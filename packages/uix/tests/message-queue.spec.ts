import { expect, test } from "@playwright/test";

test("queued notes wrap on phones and removal uses the supplied item", async ({ page }) => {
  await page.goto("/iframe.html?id=components-molecules-message-queue--queued&viewMode=story");
  const queue = page.getByRole("region", { name: "Queued messages", exact: true });
  await expect(queue).toContainText("2 queued");
  await expect(queue).toContainText("Kyoshi is responding");
  await page.setViewportSize({ width: 390, height: 844 });
  const note = queue.locator("li").last().locator(".ui-message-queue__text");
  await expect(note).toHaveCSS("white-space", "pre-wrap");
  expect(await note.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("message-queue-phone.png"), animations: "disabled" });
  const remove = queue.getByRole("button", { name: 'Remove "Keep the opening example short." from the queue', exact: true });
  await remove.focus();
  await remove.press("Enter");
  await expect(queue).toContainText("1 queued");
  await expect(queue.getByText("Keep the opening example short.", { exact: true })).toHaveCount(0);
  await expect(note).toContainText("Use plain language");
});

test("waiting and read-only queues reflect the host while an empty queue leaves no panel", async ({ page }) => {
  await page.goto("/iframe.html?id=components-molecules-message-queue--waiting&viewMode=story");
  await expect(page.getByRole("region", { name: "Queued messages", exact: true })).toContainText("Waiting for your answer");
  await page.goto("/iframe.html?id=components-molecules-message-queue--read-only&viewMode=story");
  const queue = page.getByRole("region", { name: "Queued messages", exact: true });
  await expect(queue).toContainText("2 queued");
  await expect(queue.getByRole("button")).toHaveCount(0);
  await page.goto("/iframe.html?id=components-molecules-message-queue--empty&viewMode=story");
  await expect(page.getByRole("region", { name: "Queued messages", exact: true })).toHaveCount(0);
});
