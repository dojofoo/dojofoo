import { expect, test } from "@playwright/test";

const story = "/iframe.html?id=components-organisms-app-shell--lesson-links-and-previews&viewMode=story";
test("completed links and upcoming previews retain their separate capabilities", async ({ page }) => {
  await page.goto(story);
  const previous = page.getByRole("link", { name: /Previous lesson/ });
  await expect(previous).toHaveAttribute("href", "#completed-lesson");
  await expect(page.getByText("The current goal.", { exact: true })).toBeVisible();
  const next = page.getByRole("button", { name: /Upcoming lesson/ });
  await expect(next).not.toHaveAttribute("aria-disabled", "true");
  await next.click();
  await expect(next).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Preview an upcoming goal.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Current lesson/ })).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".ui-as-side__children").filter({ has: page.getByText("The current goal.", { exact: true }) })).toHaveCSS("height", "0px");
  await expect(page.getByRole("status")).toHaveText("");
  await previous.click();
  await expect(page.getByRole("status")).toHaveText("past:1");
  await previous.dispatchEvent("click", { metaKey: true });
  await expect(page.getByRole("status")).toHaveText("past:1");
});
test("a locked entry without a preview remains non-navigable", async ({ page }) => {
  await page.goto(story);
  const locked = page.getByRole("button", { name: /Locked without preview/ });
  await expect(locked).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("link", { name: /Locked without preview/ })).toHaveCount(0);
  await locked.dispatchEvent("click");
  await expect(page.getByRole("status")).toHaveText("");
});
