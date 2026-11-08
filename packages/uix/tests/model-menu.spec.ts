import { expect, test, type Page } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=components-molecules-composer--${id}&viewMode=story`;
const openMenu = async (page: Page, id: string) => {
  await page.goto(story(id));
  await page.getByRole("button", { name: /^Model:/ }).click();
  return page.getByRole("dialog", { name: "Model settings" });
};

test("a long model list can be searched, and Enter picks the first match", async ({ page }) => {
  const menu = await openMenu(page, "pi-models");
  const search = menu.getByRole("searchbox", { name: "Search models" });
  await expect(search).toBeFocused();
  await search.fill("glm 5.3 flash");
  await expect(menu.getByRole("option")).toHaveCount(1);
  await search.press("Enter");
  await expect(page.getByRole("button", { name: /^Model: GLM-5\.3-Flash/ })).toBeVisible();
  await page.getByRole("button", { name: /^Model:/ }).click();
  await menu.getByRole("searchbox", { name: "Search models" }).fill("no such model");
  await expect(menu.getByText("No model matches “no such model”")).toBeVisible();
});

test("models the agent can't run now are listed last, say why, and can't be picked", async ({ page }) => {
  const menu = await openMenu(page, "pi-models");
  const expired = menu.getByRole("option", { name: "Claude Sonnet 5, Sign in to GitHub Copilot again" });
  await expect(expired).toHaveAttribute("aria-disabled", "true");
  await expect(menu.getByText("Unavailable", { exact: true })).toBeVisible();
  const names = await menu.getByRole("option").evaluateAll(options => options.map(option => option.getAttribute("aria-disabled") === "true"));
  expect(names.indexOf(true)).toBeGreaterThan(0);
  expect(names.slice(names.indexOf(true)).every(Boolean)).toBe(true);
  // Playwright waits for an aria-disabled row to be enabled; a person can still press it
  await expired.click({ force: true });
  await expect(page.getByRole("button", { name: /^Model: DeepSeek V4\.1 Flash/ })).toBeVisible();
});

test("a conversation without a model shows the agent's default and checks no model", async ({ page }) => {
  const menu = await openMenu(page, "agent-default-model");
  await expect(page.getByRole("button", { name: "Model: Agent default" })).toBeVisible();
  await expect(menu.getByRole("option", { selected: true })).toHaveCount(0);
});

test("a model without a default level of its own runs at Default until a level is chosen", async ({ page }) => {
  const menu = await openMenu(page, "open-code-models");
  const effort = menu.getByRole("radiogroup", { name: "Effort" });
  await expect(effort.getByRole("radio", { name: "Default" })).toBeChecked();
  await effort.getByRole("radio", { name: "High" }).click();
  await expect(page.getByRole("button", { name: "Model: DeepSeek V4 Pro, High effort" })).toBeVisible();
  await effort.getByRole("radio", { name: "Default" }).click();
  await expect(page.getByRole("button", { name: "Model: DeepSeek V4 Pro" })).toBeVisible();
});

test("a short model list has no search field", async ({ page }) => {
  const menu = await openMenu(page, "codex-models");
  await expect(menu.getByRole("option")).toHaveCount(3);
  await expect(menu.getByRole("searchbox")).toHaveCount(0);
});
