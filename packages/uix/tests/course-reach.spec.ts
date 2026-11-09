import { expect, test } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=web-site--${id}&viewMode=story&globals=theme:light`;

test("a long course's chart fits on a desktop and scrolls its plot alone on a phone, the axis and legend staying in view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(story("course-with-many-lessons"));
  const reach = page.getByRole("region", { name: "Lesson by lesson" });
  await expect(reach.getByRole("listitem").filter({ hasText: /^Lesson \d+,/ })).toHaveCount(160);
  const plot = reach.getByRole("group", { name: /^Lessons/ });
  expect(await plot.evaluate(el => el.parentElement!.scrollWidth <= el.parentElement!.clientWidth)).toBe(true);
  // The axis names the first lesson and every tenth, the last one too
  await expect(reach.locator("[data-axis=x] span")).toHaveText(["1", ...Array.from({ length: 16 }, (_, index) => `${(index + 1) * 10}`)]);

  await page.setViewportSize({ width: 390, height: 844 });
  await reach.scrollIntoViewIfNeeded();
  for (const name of ["Reached", "Finished"]) await expect(reach.getByRole("list", { name: "Legend" }).getByText(name, { exact: true })).toBeInViewport({ ratio: 1 });
  // The arrow keys read the lessons out and scroll the plot to keep the picked one in view; the axis stays where it was
  const axis = reach.getByText("16k", { exact: true });
  const axisAt = await axis.boundingBox();
  await plot.focus();
  await page.keyboard.press("End");
  await expect(reach.getByText(/^Lesson 160: [\d.]+k reached, [\d.]+k finished · /)).toBeVisible();
  await expect.poll(() => plot.evaluate(el => el.parentElement!.scrollLeft)).toBeGreaterThan(0);
  expect(await axis.boundingBox()).toEqual(axisAt);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("pointing at a chapter with a long name reads it out on one line without moving the chart", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(story("course-with-many-chapters"));
  const reach = page.getByRole("region", { name: "Chapter by chapter" });
  await reach.scrollIntoViewIfNeeded();
  const plot = reach.getByRole("group", { name: /^Chapters/ });
  const before = await plot.boundingBox();
  // The fourth of 48 steps
  await page.mouse.move(before!.x + before!.width * (3.5 / 48), before!.y + 40);
  await expect(reach.getByText(/^Chapter 4: [\d.]+k reached, [\d.]+k finished · Services, layers and dependency injection$/)).toBeVisible();
  expect(await plot.boundingBox()).toEqual(before);
});
