import { expect, test } from "@playwright/test";

test("the landing preview works without JavaScript and loads no editor or docs font", async ({ browser, page, baseURL }) => {
  const staticContext = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const staticPage = await staticContext.newPage();
  await staticPage.goto("/");
  const illustration = staticPage.locator("[data-learning-illustration]");
  await expect(illustration).toBeVisible();
  const desktopBackground = await illustration.evaluate(el => getComputedStyle(el).backgroundImage);
  expect(desktopBackground).toContain("dark-desktop");
  // A background must load and decode, not merely have a CSS declaration.
  const asset = desktopBackground.match(/url\("?([^"\)]+)"?\)/)?.[1];
  expect(asset).toBeTruthy();
  expect((await staticPage.request.get(asset!)).ok()).toBe(true);
  const frame = staticPage.locator("[data-app-preview-frame]");
  const desktop = await frame.boundingBox();
  expect(desktop!.width / desktop!.height).toBeCloseTo(16 / 9, 2);
  await staticPage.setViewportSize({ width: 390, height: 844 });
  await expect(illustration).toHaveCSS("background-image", /dark-phone/);
  const mobile = await frame.boundingBox();
  expect(mobile!.width / mobile!.height).toBeCloseTo(5 / 8, 2);
  // Both FAQ prose and its matching structured data are present in server HTML.
  const faq = JSON.parse(await staticPage.locator('script[type="application/ld+json"]').first().textContent() ?? "{}")["@graph"].find((node: {"@type": string}) => node["@type"] === "FAQPage");
  expect(await staticPage.locator("[data-faq-answer] p").allTextContents()).toEqual(faq.mainEntity.map((item: {acceptedAnswer: {text: string}}) => item.acceptedAnswer.text));
  await staticContext.close();

  const errors: string[] = [];
  const expensiveRequests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/monaco|editor-worker|editor-core|iosevka|docs-page-content|comparison-page-content|masterclass/i.test(request.url())
      || (request.resourceType() === "font" && /inter-latin-opsz/i.test(request.url()))) expensiveRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".ui-logos__mark")).toHaveCount(3);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-learning-illustration] canvas, [data-learning-illustration] button, [data-learning-illustration] pre")).toHaveCount(0);
  expect(expensiveRequests).toEqual([]);
  expect(errors).toEqual([]);
  const preview = page.getByRole("img", { name: /^Inside a course:/ });
  expect(await preview.ariaSnapshot()).not.toContain("button");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await expect(page.locator("[data-learning-illustration]")).toHaveCSS("background-image", /light-desktop/);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect(page.locator("[data-learning-illustration]")).toHaveCSS("background-image", /dark-desktop/);
});

test("agent logos expose one named image and use external SVG assets", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  const logos = page.locator(".ui-logos__mark");
  await expect(logos).toHaveCount(5);
  const client = await page.context().newCDPSession(page);
  const { nodes } = await client.send("Accessibility.getFullAXTree");
  expect(nodes.filter(node => !node.ignored && node.role?.value === "image" && !node.name?.value)).toEqual([]);
  for (const logo of await logos.all()) {
    await expect(logo).toHaveAttribute("role", "img");
    await expect(logo).toHaveAttribute("aria-label", /\S/);
    await expect(logo.locator("svg")).toHaveCount(0);
    await expect(logo).toHaveCSS("mask-image", /\/assets\/.+\.svg/);
  }
});

test("loading the brand font keeps the mobile preview in place", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 823 });
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/inter-latin-*-normal*.woff2", async route => {
    await waiting;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe("loading");
  const preview = page.locator("[data-app-preview-frame]");
  const before = await preview.boundingBox();
  release();
  await page.evaluate(() => document.fonts.ready);
  const after = await preview.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
});
