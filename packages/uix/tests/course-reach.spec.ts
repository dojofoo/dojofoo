import { expect, test } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=web-site--${id}&viewMode=story&globals=theme:light`;

test("a long course's chart scrolls its bars alone on a phone, the axis and the switch staying in view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(story("course-with-many-lessons"));
  const reach = page.getByRole("region", { name: "Reaching each lesson" });
  await expect(reach.getByRole("listitem")).toHaveCount(160);
  await reach.scrollIntoViewIfNeeded();
  // The switch keeps its words
  for (const name of ["Reached", "Finished"]) {
    const tab = reach.getByRole("tab", { name });
    await expect(tab).toBeInViewport({ ratio: 1 });
    expect(await tab.evaluate(el => [el, ...el.querySelectorAll("*")].every(node => node.scrollWidth <= node.clientWidth + 1))).toBe(true);
  }
  // The keyboard scrolls the bars; the axis stays where it was, the page doesn't scroll sideways
  const axis = reach.getByText("16k", { exact: true });
  const axisAt = await axis.boundingBox();
  const bars = reach.getByRole("group", { name: "Bars, one per lesson" });
  await bars.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => bars.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  expect(await axis.boundingBox()).toEqual(axisAt);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("pointing at a bar with a long name names it on one line without moving the chart", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(story("course-with-many-chapters"));
  const reach = page.getByRole("region", { name: "Reaching each chapter" });
  await reach.scrollIntoViewIfNeeded();
  const first = reach.getByRole("listitem").first();
  const before = await first.boundingBox();
  await reach.getByRole("listitem").nth(3).hover();
  await expect(reach.getByText(/^Chapter 4: [\d.]+k reached · Services, layers and dependency injection$/)).toBeVisible();
  expect(await first.boundingBox()).toEqual(before);
});
