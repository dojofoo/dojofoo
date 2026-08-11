import { expect, test } from "@playwright/test";

test("browses compact courses from reusable marketplace navigation", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Dojos" })).toBeVisible();
  await expect(page.getByText("AI-assisted courses", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /Build an LLM/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Effect TS/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Pydantic Agents/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Python" })).toBeVisible();
  await expect(page.getByRole("button", { name: "TypeScript" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Search" })).toBeVisible();
  await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get Dojocho" })).toBeVisible();
  await expect(page.locator("[data-site-navigation]")).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search courses" })).toHaveCount(0);

  const effectCard = page.getByTestId("course-effect-ts");
  const categorySidebar = page.getByRole("complementary", { name: "Dojo categories" });
  const selectedCategory = page.getByRole("button", { name: "All", exact: true });
  const dojoHeading = page.getByRole("heading", { name: "Dojos" });
  const [sidebarBox, categoryBox, headingBox] = await Promise.all([
    categorySidebar.boundingBox(),
    selectedCategory.boundingBox(),
    dojoHeading.boundingBox(),
  ]);
  expect(sidebarBox!.width).toBe(304);
  expect(categoryBox!.width).toBeGreaterThanOrEqual(sidebarBox!.width - 1);
  expect(headingBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width);
  await expect(selectedCategory.getByRole("img", { name: "Selected category" })).toBeVisible();
  const pythonCategory = page.getByRole("button", { name: "Python", exact: true });
  await pythonCategory.hover();
  await page.waitForTimeout(200);
  const hoverColors = await pythonCategory.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--hover)";
    element.append(probe);
    const hover = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      actual: getComputedStyle(element).backgroundColor,
      hover,
    };
  });
  expect(hoverColors.actual).toBe(hoverColors.hover);
  await expect(effectCard.getByText("v0.0.4")).toBeVisible();
  await expect(effectCard.getByText("dojocho", { exact: true })).toHaveCount(0);
  await expect(effectCard.getByText("TypeScript", { exact: true })).toHaveCount(0);
  await expect(effectCard.getByRole("img", { name: "Weekly starts and completions" })).toHaveCount(0);
  await expect(effectCard.locator("canvas")).toHaveCount(0);
  await expect(effectCard.getByRole("button", { name: "Copy to clipboard" })).toBeVisible();
  const installFooter = effectCard.locator('[data-slot="card-footer"]');
  const installCommand = installFooter.locator(':scope > div');
  const [footerBox, installBox] = await Promise.all([installFooter.boundingBox(), installCommand.boundingBox()]);
  const installPaddingTop = installBox!.y - footerBox!.y;
  const installPaddingBottom = footerBox!.y + footerBox!.height - (installBox!.y + installBox!.height);
  expect(installPaddingTop).toBeGreaterThan(0);
  expect(Math.abs(installPaddingTop - installPaddingBottom)).toBeLessThanOrEqual(1);
  const cardBeforeHover = await effectCard.boundingBox();
  await effectCard.hover();
  await page.waitForTimeout(350);
  expect(await effectCard.boundingBox()).toEqual(cardBeforeHover);
  expect(await effectCard.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--primary)";
    element.append(probe);
    const primary = getComputedStyle(probe).color;
    probe.remove();
    return getComputedStyle(element).borderTopColor === primary;
  })).toBe(true);

  await page.locator("[data-site-navigation]").getByRole("button", { name: "Open Search" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const search = page.getByPlaceholder("Search");
  await search.fill("pydantic");
  await expect(page.getByRole("button", { name: /Pydantic Agents/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Effect TS/i })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: /Effect TS/i }).click();
  await expect(page.getByRole("heading", { name: "Effect TS" })).toBeVisible();
  await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get Dojocho" })).toBeVisible();
  await expect(page.locator("[data-site-navigation]")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Starts versus finishes" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Dojo instances reaching each chapter" })).toHaveAttribute("data-chapter-count", "40");
  expect(consoleErrors).toEqual([]);
});

test("server-renders course data without route loading screens", async ({ request }) => {
  const marketplace = await request.get("/");
  expect(marketplace.status()).toBe(200);
  expect(marketplace.headers()["cache-control"]).toContain("s-maxage=60");
  const marketplaceHtml = await marketplace.text();
  expect(marketplaceHtml).toContain("Effect TS");
  expect(marketplaceHtml).not.toContain("Loading courses");

  const course = await request.get("/courses/dojocho/effect-ts");
  expect(course.status()).toBe(200);
  expect(course.headers()["cache-control"]).toContain("s-maxage=60");
  const courseHtml = await course.text();
  expect(courseHtml).toContain("Chapter reach");
  expect(courseHtml).not.toContain("Loading course");
});

test("uses the same site navigation on marketplace and docs", async ({ page }) => {
  const measurements: Array<{ width: number; height: number }> = [];
  for (const path of ["/", "/docs"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const navigation = page.locator("[data-site-navigation]");
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole("button", { name: "Open Search" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "GitHub" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Get Dojocho" })).toBeVisible();
    await expect(navigation.locator("[data-cta-inset]")).toBeVisible();
    const box = await navigation.boundingBox();
    expect(box).not.toBeNull();
    measurements.push({ width: box!.width, height: box!.height });
  }
  expect(measurements[0]).toEqual(measurements[1]);
});

test("reflects install, progress, and completion events", async ({ page, request }) => {
  const instanceId = "playwright-completed-course";
  for (const event of [
    { event: "installed" },
    { event: "started", kata: "001-hello-effect" },
    { event: "kata_completed", kata: "001-hello-effect" },
    { event: "finished", kata: "040-request-batching" },
  ]) {
    const response = await request.post("http://127.0.0.1:4311/api/v1/events", {
      data: { instanceId, courseId: "dojocho/effect-ts", ...event },
    });
    expect(response.status()).toBe(202);
  }

  await page.goto("/courses/dojocho/effect-ts");
  await expect(page.getByRole("paragraph").filter({ hasText: "1 finished" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Starts versus finishes" })).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
});
