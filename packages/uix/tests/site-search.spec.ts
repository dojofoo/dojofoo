import { expect, test } from "@playwright/test";

test("website search reuses the command palette for courses and docs", async ({ page }) => {
  await page.goto("/iframe.html?id=web-site--course&viewMode=story");
  const opener = page.getByRole("button", { name: "Search courses", exact: true });
  await opener.click();
  const palette = page.locator("dialog.ui-as-palette[open]");
  await expect(palette).toBeVisible();
  const input = palette.getByRole("combobox");
  await expect(input).toBeFocused();
  await input.fill("effect");
  await expect(palette.getByRole("option")).not.toHaveCount(0);
  await expect(palette.getByText(/Ask assistant/)).toHaveCount(0);
  await palette.getByRole("tab", { name: "Docs", exact: true }).click();
  await input.fill("installation");
  await expect(palette.getByRole("option").first()).toContainText("Installation");
  await input.press("ArrowDown");
  await input.press("Escape");
  await expect(input).toHaveValue("");
  await input.press("Escape");
  await expect(palette).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await palette.getByRole("combobox").fill("zzzz-no-matches");
  await expect(palette.getByRole("status")).toContainText("No courses found");
});
