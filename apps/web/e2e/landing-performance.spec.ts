import { expect, test } from "@playwright/test";

test("the landing illustration serves code without JavaScript and loads no editor runtime", async ({ browser, page, baseURL }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const staticContext = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const staticPage = await staticContext.newPage();
  await staticPage.goto("/");
  await expect(staticPage.locator("[data-learning-illustration] pre")).toContainText("def encode(text, vocab):");
  await expect(staticPage.locator(".ui-as-workspace-panels")).toHaveCSS("display", "flex");
  const avatar = staticPage.locator("[data-learning-illustration] img");
  await expect(avatar).toHaveCount(1);
  await expect.poll(() => avatar.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await staticContext.close();

  const editorRequests: string[] = [];
  page.on("request", request => {
    if (/monaco|editor-worker|editor-core/i.test(request.url())) editorRequests.push(request.url());
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("[data-learning-illustration] pre")).toContainText("return []");
  await expect(page.locator("[data-learning-illustration] .monaco-editor")).toHaveCount(0);
  expect(editorRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  const illustration = page.getByRole("img", { name: /^Inside a course:/ });
  expect(await illustration.ariaSnapshot()).not.toContain("button");
  const shader = page.locator("[data-learning-illustration] .lj-course canvas");
  await expect(shader).toHaveCount(1);
  await expect(shader).toHaveAttribute("width", /^[1-9]\d*$/);
});

test("agent logos expose one named image and hide their decorative SVG", async ({ page }) => {
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
    await expect(logo.locator("svg")).toHaveAttribute("aria-hidden", "true");
  }
});
