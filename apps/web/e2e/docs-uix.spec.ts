import { expect, test } from "@playwright/test";
import { AGENT_PROMPT } from "../src/components/install-prompt";

test("native documentation uses UIX while the host keeps URLs, content and browser history", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (text: string) => { document.documentElement.dataset.copiedMarkdown = text; },
    } });
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/docs", { waitUntil: "networkidle" });
  await expect(page.locator(".ui-docs-layout")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usage", exact: true })).toBeVisible();
  const tree = page.getByRole("complementary", { name: "Pages", exact: true });
  const originalHeader = await page.locator("[data-site-navigation]").elementHandle();
  const originalTree = await tree.elementHandle();
  await expect(tree.getByRole("link", { name: "Quickstart", exact: true })).toHaveAttribute("href", "/docs/quickstart");
  let resumeNavigation!: () => void;
  let navigationStarted!: () => void;
  const heldResponse = new Promise<void>(resolve => { resumeNavigation = resolve; });
  const started = new Promise<void>(resolve => { navigationStarted = resolve; });
  await page.route("**/_serverFn/**", async route => {
    navigationStarted();
    await heldResponse;
    await route.continue();
  }, { times: 1 });
  await tree.getByRole("link", { name: "Quickstart", exact: true }).click();
  await started;
  try {
    expect(await page.getByRole("heading", { name: "Usage", exact: true }).count()).toBe(1);
    expect(await page.getByRole("heading", { name: "Quickstart", exact: true }).count()).toBe(0);
  } finally { resumeNavigation(); }
  await expect(page).toHaveURL(/\/docs\/quickstart$/);
  await expect(page.getByRole("heading", { name: "Quickstart", exact: true })).toBeVisible();
  await expect(page.locator(".ui-docs__prose")).toContainText("npx dojofoo");
  expect(await originalHeader!.evaluate(element => element.isConnected)).toBe(true);
  expect(await originalTree!.evaluate(element => element.isConnected)).toBe(true);
  await page.getByRole("button", { name: "Copy Markdown", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-copied-markdown", /# Quickstart[\s\S]*npx dojofoo/);
  const firstHeading = page.locator(".ui-docs__prose h2").first();
  const headingId = await firstHeading.getAttribute("id");
  const headingLink = firstHeading.locator(`a[href="#${headingId}"]`);
  expect(await headingLink.evaluate(element => getComputedStyle(element).color)).toBe(await firstHeading.evaluate(element => getComputedStyle(element).color));
  expect(await headingLink.evaluate(element => getComputedStyle(element).textDecorationLine)).toBe("none");
  expect(headingId).toBeTruthy();
  await page.getByRole("navigation", { name: "On this page", exact: true }).locator(`a[href="#${headingId}"]`).click();
  await expect.poll(() => new URL(page.url()).hash).toBe(`#${headingId}`);
  await page.goBack();
  await expect(page).toHaveURL(/\/docs\/quickstart$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByRole("heading", { name: "Usage", exact: true })).toBeInViewport();
  const opened = page.context().waitForEvent("page");
  await tree.getByRole("link", { name: "Installation", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  const tab = await opened;
  await expect(tab).toHaveURL(/\/docs\/installation$/);
  await expect(tab.getByRole("heading", { name: "Installation", exact: true })).toBeVisible();
  await tab.close();
  await page.screenshot({ path: testInfo.outputPath("uix-docs-desktop.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("uix-docs-mobile.png"), animations: "disabled" });
  await tree.getByRole("link", { name: "Quickstart", exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/quickstart$/);
  await expect(page.getByRole("heading", { name: "Quickstart", exact: true })).toBeInViewport();
  expect(errors).toEqual([]);
});

test("Markdown endpoints preserve real content and return 404 for missing pages", async ({ request }) => {
  const usage = await request.get("/llms.mdx/docs/docs/index.mdx");
  expect(usage.status()).toBe(200);
  expect(usage.headers()["content-type"]).toContain("text/markdown");
  expect(await usage.text()).toContain("# Usage");
  const missing = await request.get("/llms.mdx/docs/no-such-page/index.mdx");
  expect(missing.status()).toBe(404);
});


test("documentation sections and legacy dojo-document links keep their real compiled pages", async ({ page }) => {
  for (const [path, title] of [["/authoring", "Authoring"], ["/developers", "Developers"], ["/docs/api", "API"], ["/dojos/effect-ts", "Effect-TS"]]) {
    const response = await page.goto(path, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.locator(".ui-docs-layout")).toBeVisible();
    await expect(page.getByRole("heading", { name: title, exact: true, level: 1 })).toBeVisible();
    if (path === "/dojos/effect-ts") {
      await expect(page.getByRole("complementary", { name: "Pages", exact: true }).getByRole("link", { name: "Overview", exact: true })).toHaveAttribute("href", "/dojos");
      await expect(page.getByRole("navigation", { name: "More pages", exact: true }).locator('a[href="/dojos/pydantic-agents"]')).toHaveCount(1);
    }
  }
});


test("Installation uses shared command controls and preserves the agent setup prompt", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (text: string) => { document.documentElement.dataset.copiedCommand = text; },
    } });
  });
  await page.goto("/docs/installation", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Installation", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Copy npx dojofoo install", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-copied-command", "npx dojofoo install");
  await page.getByRole("button", { name: "Copy Prompt", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-copied-command", AGENT_PROMPT);
});
