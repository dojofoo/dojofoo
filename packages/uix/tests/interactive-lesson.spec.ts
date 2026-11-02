import { expect, test } from "@playwright/test";

for (const theme of ["dark", "light"]) test(`authored steps and answer feedback use the shared lesson surface in ${theme}`, async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/iframe.html?id=components-organisms-interactive-lesson--present-and-question&viewMode=story&globals=theme:${theme}`);
  await expect(page.getByRole("heading", { name: "Find your way around", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your answer", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const answer = page.getByRole("textbox", { name: "Your answer", exact: true });
  await expect(page.getByRole("button", { name: "Check answer", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await answer.fill("sidebar");
  await answer.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Not quite: sidebar");
  await expect(page.getByText("The Resources section contains the lesson's authored links.", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`interactive-feedback-${theme}.png`) });
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await answer.fill("resources");
  await answer.press("Enter");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "How to run a dojo", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
  await expect(page.getByText("Your progress was saved.", { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});
