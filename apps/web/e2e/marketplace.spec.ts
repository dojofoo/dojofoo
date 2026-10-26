import { expect, test } from "@playwright/test";

const apiOrigin = process.env.DOJO_API_TEST_ORIGIN ?? "http://127.0.0.1:4311";
const effectVersion = { version: "0.0.6" };

test("browses, filters, sorts, and opens courses from the catalog", async ({ page, request }) => {
  const oldInstall = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  for (const [instanceId, courseId, occurredAt] of [
    ["popular-effect-1", "dojofoo/effect-ts", oldInstall],
    ["popular-effect-2", "dojofoo/effect-ts", oldInstall],
    ["trending-pydantic", "dojofoo/pydantic", new Date().toISOString()],
  ]) {
    const response = await request.post(`${apiOrigin}/api/v1/events`, {
      data: { instanceId, courseId, event: "installed", occurredAt },
    });
    expect(response.status()).toBe(202);
  }

  await page.goto("/dojos", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "All dojos", level: 1 })).toBeVisible();
  const cards = page.locator('[data-testid^="course-"]');
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toHaveAttribute("data-testid", "course-effect-ts");
  const sort = page.getByRole("combobox", { name: "Sort dojos" });
  await sort.click();
  await page.getByRole("option", { name: "Newest" }).click();
  await expect(cards.first()).toHaveAttribute("data-testid", "course-build-llm");
  await expect(page.getByRole("option", { name: "Newest" })).toBeHidden();
  await sort.click();
  await page.getByRole("option", { name: "Trending" }).click();
  await expect(cards.first()).toHaveAttribute("data-testid", "course-pydantic");
  await expect(page.getByRole("option", { name: "Trending" })).toBeHidden();

  const languages = page.getByRole("navigation", { name: "Framework / Lang", exact: true });
  const frameworks = page.getByRole("navigation", { name: "Framework", exact: true });
  await languages.getByRole("button", { name: "Python", exact: true }).click();
  await expect(cards).toHaveCount(2);
  await expect(page.getByTestId("course-effect-ts")).toHaveCount(0);
  await frameworks.getByRole("button", { name: "Pydantic AI", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(page.getByTestId("course-pydantic")).toBeVisible();
  await frameworks.getByRole("button", { name: "Any framework", exact: true }).click();
  await languages.getByRole("button", { name: "Any", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search courses" });
  await search.fill("no-such-course");
  await expect(cards).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(cards).toHaveCount(3);

  const effectCard = page.getByTestId("course-effect-ts");
  await expect(effectCard.getByText(`v${effectVersion.version}`)).toBeVisible();
  await expect(effectCard.getByText("npx dojofoo add dojofoo/effect-ts", { exact: true })).toBeVisible();
  await expect(effectCard.getByRole("button", { name: "Copy to clipboard" })).toBeVisible();
  // The card's real destination and install command must survive presentation changes.
  await effectCard.getByRole("link", { name: "Open Effect TS" }).click();
  await expect(page).toHaveURL(/\/courses\/dojofoo\/effect-ts$/);
  await expect(page.getByRole("heading", { name: "Effect TS", exact: true })).toBeVisible();
  await expect(page.getByText("Master Effect through 40 hands-on katas.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("course-source")).toHaveAttribute("href", "https://github.com/dojofoo/effect-ts");
  await expect(page.getByRole("progressbar", { name: "Starts versus finishes" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Dojo instances reaching each chapter" })).toHaveAttribute("data-chapter-count", "40");
  await expect(page.getByRole("complementary", { name: "Course activity" }).getByRole("button", { name: /Copy Install/ })).toBeVisible();
});

test("server-renders course data without route loading screens", async ({ request }) => {
  const marketplace = await request.get("/");
  expect(marketplace.status()).toBe(200);
  expect(marketplace.headers()["cache-control"]).toContain("s-maxage=300");
  const marketplaceHtml = await marketplace.text();
  expect(marketplaceHtml).toContain("Effect TS");
  expect(marketplaceHtml).not.toContain("Loading courses");

  const course = await request.get("/courses/dojofoo/effect-ts");
  expect(course.status()).toBe(200);
  expect(course.headers()["cache-control"]).toContain("s-maxage=300");
  const courseHtml = await course.text();
  expect(courseHtml).not.toContain("Chapter reach");
  expect(courseHtml).not.toContain("Unique dojo instances that reached each chapter.");
  expect(courseHtml).toContain("Dojo instances reaching each chapter");
  expect(courseHtml).not.toContain("Loading course");

  const legacyCourse = await request.get("/courses/dojocho/effect-ts");
  expect(legacyCourse.status()).toBe(200);
  expect(await legacyCourse.text()).toContain("Effect TS");
});

test("uses the same site navigation on marketplace and docs", async ({ page }) => {
  const measurements: Array<{ width: number; height: number }> = [];
  for (const path of ["/", "/dojos", "/docs"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const navigation = page.locator("[data-site-navigation]");
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole("button", { name: "Open Search" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Dojos", exact: true })).toHaveAttribute("href", "/dojos");
    await expect(navigation.getByRole("link", { name: "Docs", exact: true })).toHaveAttribute("href", "/docs");
    await expect(page.locator("footer").getByRole("link", { name: "GitHub", exact: true })).toHaveAttribute("href", "https://github.com/dojofoo/dojofoo");
    expect(await page.evaluate(() => {
      const surface = document.querySelector("aside, .marketplace-lined-surface");
      return surface
        ? getComputedStyle(document.body).backgroundColor === getComputedStyle(surface).backgroundColor
        : false;
    })).toBe(true);
    const box = await navigation.boundingBox();
    expect(box).not.toBeNull();
    measurements.push({ width: box!.width, height: box!.height });
  }
  expect(measurements[0]).toEqual(measurements[1]);
  expect(measurements[0]).toEqual(measurements[2]);
});

test("reflects install, progress, and completion events", async ({ page, request }) => {
  const instanceId = "playwright-completed-course";
  for (const event of [
    { event: "installed" },
    { event: "started", kata: "001-hello-effect" },
    { event: "kata_completed", kata: "001-hello-effect" },
    { event: "finished", kata: "040-request-batching" },
  ]) {
    const response = await request.post(`${apiOrigin}/api/v1/events`, {
      data: { instanceId, courseId: "dojofoo/effect-ts", ...event },
    });
    expect(response.status()).toBe(202);
  }

  await page.goto("/courses/dojofoo/effect-ts");
  await expect(page.getByTestId("course-progress").getByText("1 finished", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Starts versus finishes" })).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
});
