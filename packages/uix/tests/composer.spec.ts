import { expect, test } from "@playwright/test";

const story = "/iframe.html?id=components-molecules-composer--controlled&viewMode=story";

test("controlled composer keeps history drafts, multiline editing and native composition", async ({ page }) => {
  await page.goto(story);
  const field = page.getByRole("textbox", { name: "Message the Sensei" });
  await field.fill("Unsent note");
  await field.press("ArrowUp");
  await expect(field).toHaveValue("Can I have a hint?");
  await field.press("ArrowUp");
  await expect(field).toHaveValue("Where are my files?");
  await field.press("ArrowDown");
  await expect(field).toHaveValue("Can I have a hint?");
  await field.press("ArrowDown");
  await expect(field).toHaveValue("Unsent note");
  await field.fill("first\nsecond");
  await field.press("ArrowUp");
  await expect(field).toHaveValue("first\nsecond");
  await field.fill("An unfinished composition");
  await field.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(page.getByRole("status")).toHaveText("");
  await field.press("Shift+Enter");
  await expect(field).toHaveValue("An unfinished composition\n");
});

test("controlled composer sends, cancels and changes only the supplied model choices", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(story);
  for (const name of ["Add file", "Dictate", "Plugins", "Connect apps"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  const field = page.getByRole("textbox", { name: "Message the Sensei" });
  await field.fill("What should I try?");
  await field.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Sent: What should I try?");
  await expect(field).toHaveValue("");
  await expect(field).toBeDisabled();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Stopped");
  await expect(field).toBeEnabled();
  await page.getByRole("button", { name: "Harness model", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Available model B", exact: true }).click();
  await expect(page.getByRole("button", { name: "Harness model", exact: true })).toHaveText("Available model B");
  await page.screenshot({ path: info.outputPath("controlled-composer.png") });
  expect(errors).toEqual([]);
});
