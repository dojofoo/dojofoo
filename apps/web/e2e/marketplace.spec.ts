import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";

const apiOrigin = process.env.DOJO_API_TEST_ORIGIN ?? "http://127.0.0.1:4311";
const effectVersion = { version: "0.0.6" };

test("browses compact courses from reusable marketplace navigation", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const oldInstall = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  await Promise.all([
    page.request.post(`${apiOrigin}/api/v1/events`, {
      data: { instanceId: "popular-effect-1", courseId: "dojofoo/effect-ts", event: "installed", occurredAt: oldInstall },
    }),
    page.request.post(`${apiOrigin}/api/v1/events`, {
      data: { instanceId: "popular-effect-2", courseId: "dojofoo/effect-ts", event: "installed", occurredAt: oldInstall },
    }),
    page.request.post(`${apiOrigin}/api/v1/events`, {
      data: { instanceId: "trending-pydantic", courseId: "dojofoo/pydantic", event: "installed" },
    }),
  ]);
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Dojos" })).toBeVisible();
  await expect(page.getByText("Dojos are AI-assisted courses. Add them via CLI and let your agent guide you through katas, learning material, and interactive teaching dialogues.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Build an LLM/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Effect TS/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Pydantic Agents/i })).toBeVisible();
  const language = page.getByRole("combobox", { name: "Filter by language" });
  const framework = page.getByRole("combobox", { name: "Filter by framework" });
  const filterSidebar = page.getByRole("complementary", { name: "Dojo filters" });
  await expect(filterSidebar).toBeVisible();
  await expect(filterSidebar.getByText("Filters", { exact: true })).toBeVisible();
  await expect(filterSidebar.getByRole("combobox", { name: "Filter by language" })).toBeVisible();
  await expect(filterSidebar.getByRole("combobox", { name: "Filter by framework" })).toBeVisible();
  await expect(language).toHaveText(/All languages/);
  await expect(framework).toHaveText(/All frameworks/);
  await expect(page.getByRole("button", { name: "Open Search" })).toBeVisible();
  const sort = page.getByRole("combobox", { name: "Sort dojos" });
  await expect(filterSidebar.getByRole("combobox", { name: "Sort dojos" })).toHaveCount(0);
  await expect(sort).toHaveText(/Popularity/);
  await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
  const getStarted = page.getByRole("link", { name: "Get Started" });
  await expect(getStarted).toBeVisible();
  await expect(getStarted.locator("svg")).toHaveCount(0);
  expect(await getStarted.evaluate((element) => {
    const inset = element.querySelector<HTMLElement>("[data-cta-inset]");
    const styles = getComputedStyle(element);
    return {
      radius: Number.parseFloat(styles.borderRadius),
      insetMatchesText: inset ? getComputedStyle(inset).borderColor === styles.color : false,
    };
  })).toEqual({ radius: 2, insetMatchesText: true });
  await expect(page.locator("[data-site-navigation]")).toBeVisible();
  await expect(page.locator('link[rel="icon"][href="/favicon.svg"]')).toHaveCount(1);
  const favicon = await page.evaluate(() => fetch("/favicon.svg").then(async (response) => ({
    status: response.status,
    text: await response.text(),
  })));
  expect(favicon.status).toBe(200);
  expect(favicon.text).toContain('viewBox="0 0 618 619"');
  expect(createHash("sha256").update(favicon.text).digest("hex")).toBe("680734d38389d37d70c1e2acf05e7e59d0b834fbfb8050463a7457cfb9b9c673");
  const wordmark = page.getByRole("img", { name: "dojofoo" });
  await expect(wordmark).toBeVisible();
  await expect(wordmark).toHaveAttribute("src", /dojofoo/);
  await expect(page).toHaveTitle("dojofoo");
  await expect(page.getByRole("searchbox", { name: "Search courses" })).toHaveCount(0);

  const effectCard = page.getByTestId("course-effect-ts");
  await expect(effectCard.locator('[data-slot="card-title"]')).toHaveCSS("font-family", /Iosevka/);
  await expect(effectCard.locator('[data-slot="card-description"]')).toHaveCSS("font-family", /Geist Variable/);
  const cards = page.locator('[data-testid^="course-"]');
  await expect(cards.first()).toHaveAttribute("data-testid", "course-effect-ts");
  await sort.click();
  const newestOption = page.getByRole("option", { name: "Newest" });
  await newestOption.click();
  await expect(cards.first()).toHaveAttribute("data-testid", "course-build-llm");
  await expect(newestOption).toBeHidden();
  await sort.click();
  const trendingOption = page.getByRole("option", { name: "Trending" });
  await expect(trendingOption).toBeVisible();
  await trendingOption.click();
  await expect(cards.first()).toHaveAttribute("data-testid", "course-pydantic");
  await language.click();
  await page.getByRole("option", { name: "Python", exact: true }).click();
  await expect(page.getByRole("link", { name: /Build an LLM/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Pydantic Agents/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Effect TS/i })).toHaveCount(0);
  await framework.click();
  await expect(page.getByRole("option", { name: "PyTorch" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Pydantic AI" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Effect" })).toHaveCount(0);
  await page.getByRole("option", { name: "Pydantic AI" }).click();
  await expect(page.getByRole("link", { name: /Build an LLM/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Pydantic Agents/i })).toBeVisible();
  await language.click();
  await page.getByRole("option", { name: "TypeScript", exact: true }).click();
  await expect(framework).toHaveText(/All frameworks/);
  await expect(page.getByRole("link", { name: /Effect TS/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Pydantic Agents/i })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Dojo categories" })).toHaveCount(0);
  expect(await page.evaluate(() => {
    const sidebar = document.querySelector("aside");
    const frame = document.querySelector(".marketplace-lined-frame");
    return {
      stripedFrame: frame
        ? getComputedStyle(frame).backgroundImage.includes("0.055")
        : false,
    };
  })).toEqual({ stripedFrame: true });
  await expect(effectCard.getByText(`v${effectVersion.version}`)).toBeVisible();
  await expect(effectCard.getByText("dojofoo", { exact: true })).toHaveCount(0);
  await expect(effectCard.getByText("TypeScript", { exact: true })).toHaveCount(0);
  await expect(effectCard.getByRole("img", { name: "Weekly starts and completions" })).toHaveCount(0);
  await expect(effectCard.locator("canvas")).toHaveCount(0);
  await expect(effectCard.getByRole("button", { name: "Copy to clipboard" })).toBeVisible();
  await expect(effectCard.getByText("npx dojofoo add dojofoo/effect-ts", { exact: true })).toBeVisible();
  const installFooter = effectCard.locator('[data-slot="card-footer"]');
  const cardTitle = effectCard.locator('[data-slot="card-title"]');
  const installCommand = installFooter.locator(':scope > div');
  const [footerBox, installBox] = await Promise.all([installFooter.boundingBox(), installCommand.boundingBox()]);
  const installPaddingTop = installBox!.y - footerBox!.y;
  const installPaddingBottom = footerBox!.y + footerBox!.height - (installBox!.y + installBox!.height);
  expect(installPaddingTop).toBeGreaterThan(0);
  expect(Math.abs(installPaddingTop - installPaddingBottom)).toBeLessThanOrEqual(1);
  expect((await cardTitle.boundingBox())!.x - (await effectCard.boundingBox())!.x).toBe(17);
  const copyButton = effectCard.getByRole("button", { name: "Copy to clipboard" });
  const installText = copyButton.locator("mark");
  await expect(installText).toHaveCSS("font-family", /Iosevka/);
  const restingInstallColor = await installText.evaluate((element) => getComputedStyle(element).color);
  await copyButton.hover();
  await expect(installText).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.waitForTimeout(120);
  expect(await installText.evaluate((element, restingColor) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--foreground)";
    document.body.append(probe);
    const foreground = getComputedStyle(probe).color;
    probe.remove();
    return {
      changed: getComputedStyle(element).color !== restingColor,
      matchesForeground: getComputedStyle(element).color === foreground,
    };
  }, restingInstallColor)).toEqual({ changed: true, matchesForeground: true });
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

  const searchTrigger = page.locator("[data-site-navigation]").getByRole("button", { name: "Open Search" });
  const [searchIconBox, shortcutBox] = await Promise.all([
    searchTrigger.locator("svg").boundingBox(),
    searchTrigger.locator("kbd").boundingBox(),
  ]);
  expect(shortcutBox!.x).toBeGreaterThan(searchIconBox!.x + searchIconBox!.width);
  expect(Math.abs(
    shortcutBox!.y + shortcutBox!.height / 2 - (searchIconBox!.y + searchIconBox!.height / 2),
  )).toBeLessThanOrEqual(1);
  await searchTrigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCSS("border-radius", "0px");
  const closeSearch = page.getByRole("button", { name: "Close Search" });
  await expect(closeSearch).toHaveCSS("border-radius", "0px");
  await expect(closeSearch).toHaveCSS("background-color", "rgb(0, 0, 0)");
  const search = page.getByPlaceholder("Search");
  await search.fill("pydantic");
  await expect(page.getByRole("button", { name: /Pydantic Agents/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Effect TS/i })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: /Effect TS/i }).click();
  await expect(page.getByRole("heading", { name: "Effect TS" })).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("font-family", /Iosevka/);
  expect(await page.evaluate(async () => {
    const faces = await document.fonts.load('400 16px "Iosevka"');
    return faces.some((face) => face.status === "loaded");
  })).toBe(true);
  await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get Started" })).toBeVisible();
  await expect(page.locator("[data-site-navigation]")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Starts versus finishes" })).toBeVisible();
  const chapterChart = page.getByRole("img", { name: "Dojo instances reaching each chapter" });
  await expect(chapterChart).toHaveAttribute("data-chapter-count", "40");
  await expect(chapterChart.locator("xpath=..")).toHaveCSS("border-top-width", "0px");
  const detailArticle = page.locator("article");
  const detailSidebar = detailArticle.getByRole("complementary", { name: "Course activity" });
  const detailInstall = detailSidebar.getByRole("button", { name: /Copy Install/ });
  await expect(detailSidebar.locator(":scope > p")).toHaveCount(0);
  await expect(detailInstall).toBeVisible();
  await expect(detailInstall.getByText("Copy", { exact: true })).toHaveCount(0);
  await expect(detailInstall.locator("mark")).toHaveCSS("font-family", /Iosevka/);
  await expect(page.getByText("Master Effect through 40 hands-on katas.", { exact: true })).toHaveCSS("font-family", /Geist Variable/);
  await expect(page.getByText("Tom Siwik", { exact: true })).toBeVisible();
  await expect(page.getByText("TypeScript", { exact: true })).toBeVisible();
  await expect(page.getByText("Effect", { exact: true })).toBeVisible();
  await expect(page.getByText("Functional programming", { exact: true })).toBeVisible();
  const eyebrow = page.getByTestId("course-source");
  await expect(eyebrow).toHaveText("dojofoo/effect-ts");
  await expect(eyebrow).toHaveCSS("text-transform", "uppercase");
  await expect(eyebrow).toHaveCSS("font-size", "12px");
  await expect(eyebrow).toHaveCSS("letter-spacing", "0.48px");
  await expect(eyebrow).toHaveAttribute(
    "href",
    "https://github.com/dojofoo/effect-ts",
  );
  const [articleBox, detailSidebarBox] = await Promise.all([
    detailArticle.boundingBox(), detailSidebar.boundingBox(),
  ]);
  expect(detailSidebarBox!.y).toBe(articleBox!.y);
  expect(await detailSidebar.evaluate((element) => {
    const content = element.previousElementSibling as HTMLElement | null;
    return {
      progressIsFirst: element.firstElementChild?.getAttribute("data-testid") === "course-progress",
      paddingMatchesContent: content
        ? getComputedStyle(element).paddingTop === getComputedStyle(content).paddingTop
        : false,
    };
  })).toEqual({ progressIsFirst: true, paddingMatchesContent: true });
  expect(await eyebrow.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--primary)";
    document.body.append(probe);
    const primary = getComputedStyle(probe).color;
    probe.remove();
    return getComputedStyle(element).color === primary;
  })).toBe(true);
  await expect(page.getByRole("img", { name: "Dojo instances reaching each chapter" })).toHaveAttribute("data-accent", "primary");
  expect(consoleErrors).toEqual([]);
});

test("server-renders course data without route loading screens", async ({ request }) => {
  const marketplace = await request.get("/");
  expect(marketplace.status()).toBe(200);
  expect(marketplace.headers()["cache-control"]).toContain("s-maxage=60");
  const marketplaceHtml = await marketplace.text();
  expect(marketplaceHtml).toContain("Effect TS");
  expect(marketplaceHtml).not.toContain("Loading courses");

  const course = await request.get("/courses/dojofoo/effect-ts");
  expect(course.status()).toBe(200);
  expect(course.headers()["cache-control"]).toContain("s-maxage=60");
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
  for (const path of ["/", "/docs"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const navigation = page.locator("[data-site-navigation]");
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole("button", { name: "Open Search" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "GitHub" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Get Started" })).toBeVisible();
    await expect(navigation.locator("[data-cta-inset]")).toBeVisible();
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
