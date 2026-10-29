import { expect, test } from "@playwright/test";

test("the shared composer sends selected file contents without requiring text", async ({ page }) => {
  await page.goto("/iframe.html?id=components-molecules-composer--attachments&viewMode=story");
  await expect(page.getByRole("button", { name: "Add file", exact: true })).toBeVisible({ timeout: 15_000 });
  await page.locator('input[type="file"]').setInputFiles([
    { name: "keep.txt", mimeType: "text/plain", buffer: Buffer.from("Read this file") },
    { name: "remove.txt", mimeType: "text/plain", buffer: Buffer.from("Do not send this") },
  ]);
  await page.getByRole("button", { name: "Remove remove.txt", exact: true }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click({ timeout: 5000 });
  await expect(page.getByRole("status", { name: "Sent message" })).toHaveText(JSON.stringify({ text: "", attachments: [{ name: "keep.txt", content: "Read this file" }] }));
  await expect(page.getByRole("button", { name: "Remove keep.txt", exact: true })).toHaveCount(0);
});

test("a failed handoff retains the same text and files for retry", async ({ page }) => {
  await page.goto("/iframe.html?id=components-molecules-composer--attachment-retry&viewMode=story");
  await expect(page.getByRole("button", { name: "Add file", exact: true })).toBeVisible({ timeout: 15_000 });
  await page.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Saved notes") });
  const input = page.getByRole("textbox");
  await input.fill("Review this");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Try sending again.");
  await expect(input).toHaveValue("Review this");
  await expect(page.getByRole("button", { name: "Remove notes.txt", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("status", { name: "Sent message" })).toHaveText(JSON.stringify({ text: "Review this", attachments: [{ name: "notes.txt", content: "Saved notes" }] }));
});
