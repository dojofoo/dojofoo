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
  await expect(page.getByRole("heading", { name: "Find a dojo to practice in", level: 1 })).toBeVisible();
  const cards = page.locator(".ui-crs-grid > a");
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toHaveAttribute("href", "/courses/dojofoo/effect-ts");
  const sort = page.getByRole("button", { name: /^Sort courses:/ });
  await sort.click();
  await page.getByRole("menuitemradio", { name: "Newest" }).click();
  await expect(cards.first()).toHaveAttribute("href", "/courses/dojofoo/build-llm");
  await expect(page.getByRole("menuitemradio", { name: "Newest" })).toBeHidden();
  await sort.click();
  await page.getByRole("menuitemradio", { name: "Trending" }).click();
  await expect(cards.first()).toHaveAttribute("href", "/courses/dojofoo/pydantic");
  await expect(page.getByRole("menuitemradio", { name: "Trending" })).toBeHidden();

  const languages = page.getByRole("navigation", { name: "Language", exact: true });
  const frameworks = page.getByRole("navigation", { name: "Framework", exact: true });
  await languages.getByRole("button", { name: "Python", exact: true }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: "Effect TS" })).toHaveCount(0);
  await frameworks.getByRole("button", { name: "Pydantic AI", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.filter({ hasText: "Pydantic" })).toBeVisible();
  await frameworks.getByRole("button", { name: "Any", exact: true }).click();
  await languages.getByRole("button", { name: "Any", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search courses" });
  await search.fill("no-such-course");
  await expect(cards).toHaveCount(0);
  await page.locator(".ui-crs-count").getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(cards).toHaveCount(3);

  const effectCard = cards.filter({ hasText: "Effect TS" });
  await expect(effectCard).toHaveAttribute("href", "/courses/dojofoo/effect-ts");
  await effectCard.click();
  await expect(page).toHaveURL(/\/courses\/dojofoo\/effect-ts$/);
  await expect(page.getByRole("heading", { name: "Effect TS", exact: true })).toBeVisible();
  await expect(page.getByText("Master Effect through 40 hands-on katas.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "dojofoo/effect-ts", exact: true })).toHaveAttribute("href", "https://github.com/dojofoo/effect-ts");
  await expect(page.locator(".ui-crp-facts").getByText(`v${effectVersion.version}`, { exact: true })).toBeVisible();
  const copy = page.getByRole("button", { name: "Copy npx dojofoo add dojofoo/effect-ts", exact: true });
  await expect(page.getByText("npx dojofoo add dojofoo/effect-ts", { exact: true })).toBeVisible();
  await page.context().grantPermissions(["clipboard-write"]);
  await copy.click();
  await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Course activity" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Reaching each lesson" }).getByRole("listitem")).toHaveCount(40);
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
  const reach = /<ol class="ui-crp-reach">([\s\S]*?)<\/ol>/.exec(courseHtml);
  expect(reach).not.toBeNull();
  expect(reach![1].match(/<li\b/g)).toHaveLength(40);
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
    await expect(navigation.getByRole("button", { name: /^Search (courses|docs)$/ })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Courses", exact: true })).toHaveAttribute("href", "/dojos");
    await expect(navigation.getByRole("link", { name: "Help", exact: true })).toHaveAttribute("href", "/docs");
    await expect(page.locator("footer").getByRole("link", { name: "GitHub", exact: true })).toHaveAttribute("href", "https://github.com/dojofoo/dojofoo");
    expect(await navigation.evaluate(element => getComputedStyle(element).fontFamily)).toContain("Inter");
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
  const finished = page.getByRole("region", { name: "Course activity" }).locator(".ui-crp-stat").filter({ hasText: "Finished" });
  await expect(finished.locator("b")).toHaveText("1");
  await expect(finished.getByText("100% of starts", { exact: true })).toBeVisible();
});
