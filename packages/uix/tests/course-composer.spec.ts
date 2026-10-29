import { expect, test } from "@playwright/test";

for (const story of ["learner-kata", "course-authoring"]) test(`${story} chooses a coding agent before its models without losing the draft`, async ({ page }) => {
  await page.goto(`/iframe.html?id=pages-dojo--${story}&viewMode=story`);
  const composer = page.locator(".ui-as-composer");
  const draft = composer.getByRole("textbox");
  await draft.fill("Keep this question while choosing an agent");
  await composer.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("My course notes") });
  const agent = composer.getByRole("button", { name: "Agent", exact: true });
  await expect(agent).toContainText("OpenCode");
  await agent.click();
  await page.getByRole("menuitemradio", { name: /^Codex/ }).click();
  await expect(agent).toContainText("Codex");
  const model = composer.getByRole("button", { name: "Model", exact: true });
  await expect(model).toContainText("GPT-6.1-Astra");
  await agent.click();
  await page.getByRole("menuitemradio", { name: /^OpenCode/ }).click();
  await model.click();
  await expect(page.getByRole("menuitemradio", { name: /^DeepSeek/ })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: /^GPT-6.1-Astra/ })).toBeVisible();
  await page.getByRole("menuitemradio", { name: /^DeepSeek/ }).click();
  await expect(model).toContainText("DeepSeek");
  await expect(draft).toHaveValue("Keep this question while choosing an agent");
  await expect(composer.getByRole("button", { name: "Remove notes.txt", exact: true })).toBeVisible();
  await expect(composer.getByRole("button", { name: "Add file", exact: true })).toBeVisible();
});
