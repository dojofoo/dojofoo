import { expect, test } from "@playwright/test";

test("selection menus share the avatar box and support keyboard selection and Escape", async ({ page }) => {
  await page.goto("/iframe.html?id=components-molecules-selection-menu--controlled&viewMode=story");
  const style = (node: Element) => {
    const css = getComputedStyle(node);
    return { background: css.backgroundColor, radius: css.borderRadius, shadow: css.boxShadow };
  };
  await page.getByRole("button", { name: "You", exact: true }).click();
  const avatar = await page.locator(".ui-as-popover").evaluate(style);
  await page.keyboard.press("Escape");
  const picker = page.getByRole("button", { name: "Coding agent: OpenCode", exact: true });
  await picker.click();
  expect(await page.locator(".ui-as-popover").evaluate(style)).toEqual(avatar);
  await expect(page.getByRole("menuitemradio", { name: "OpenCode", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Coding agent: Codex", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Coding agent: Codex", exact: true })).toBeFocused();
});

test("disabled selection and unsupported attachments remain unavailable", async ({ page }) => {
  await page.goto("/iframe.html?id=components-molecules-selection-menu--disabled&viewMode=story");
  await expect(page.getByRole("button", { name: "Coding agent: OpenCode", exact: true })).toBeDisabled();
  await page.goto("/iframe.html?id=components-molecules-composer--unavailable-attachments&viewMode=story");
  await expect(page.getByRole("button", { name: "Add file", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add file", exact: true })).toBeDisabled();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.getByRole("textbox").fill("Keep this question");
  await expect(page.getByRole("textbox")).toHaveValue("Keep this question");
});
