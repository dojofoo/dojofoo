import { expect, test } from "@playwright/test";
import { mountAgentChat } from "./agent-chat.fixture";

test("queued authoring notes stay readable and can be removed with the shared controls", async ({ page }) => {
  const release = Promise.withResolvers<void>();
  let cancellations = 0;
  const { calls } = await mountAgentChat(page, { hold: release.promise, failCancel: () => cancellations++ === 0 });
  const long = "Use plain language and keep each example focused. ".repeat(8).trim();
  try {
    await page.goto("/authoring?workspace=ws-1&session=saved");
    const input = page.getByTestId("authoring-chat-composer").getByRole("textbox");
    for (const text of ["Outline the first lesson", long, "Discard this note"]) {
      await input.fill(text);
      await input.press("Enter");
    }
    const queue = page.getByRole("region", { name: "Queued messages", exact: true });
    await expect(queue).toContainText("2 queued");
    const note = queue.getByText(long, { exact: true });
    await expect(note).toHaveCSS("white-space", "pre-wrap");
    expect(await note.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(queue.getByRole("button").first()).toHaveClass(/ui-button/);
    await page.screenshot({ path: test.info().outputPath("authoring-queue-desktop.png"), animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Show chat", exact: true }).click();
    await expect(queue).toBeVisible();
    expect(await note.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("authoring-queue-phone.png"), animations: "disabled" });
    const remove = queue.getByRole("button", { name: 'Remove "Discard this note" from the queue', exact: true });
    await remove.focus();
    await remove.press("Enter");
    await expect(queue).toContainText("1 queued");
    await expect(note).toBeVisible();
    await queue.getByRole("button").click();
    await expect(queue).toHaveCount(0);
    expect(calls.filter(call => call.startsWith("POST "))).toEqual(["POST /api/v1/workspaces/ws-1/sessions/saved/runs"]);
    const stop = page.getByRole("button", { name: "Stop", exact: true });
    await expect(stop).toBeVisible({ timeout: 2000 });
    await stop.click();
    await expect(page.getByRole("alert").filter({ hasText: "Could not stop the conversation" })).toBeVisible();
    await stop.click();
    await expect(input).toBeEnabled();
    await expect(stop).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: "Could not stop the conversation" })).toHaveCount(0);
    expect(calls.filter(call => call.startsWith("PATCH "))).toHaveLength(2);
  } finally { release.resolve(); }
});
