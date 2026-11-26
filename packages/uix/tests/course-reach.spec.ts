import { expect, test } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=web-site--${id}&viewMode=story&globals=theme:light`;

test("a long course's chart fits on a desktop and scrolls its plot alone on a phone, the axes and legend staying in view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(story("course-with-many-lessons"));
  const reach = page.getByRole("region", { name: "Lesson by lesson" });
  await expect(reach.getByRole("listitem").filter({ hasText: /^Lesson 1,/ })).toHaveCount(1);
  const lessons = await reach.getByRole("listitem").filter({ hasText: /^Lesson \d+,/ }).count();
  expect(lessons).toBeGreaterThan(140);
  const plot = reach.getByRole("group", { name: /^Lessons/ });
  expect(await plot.evaluate(el => el.parentElement!.scrollWidth <= el.parentElement!.clientWidth)).toBe(true);
  // The chapters numbered along the top, the lessons every tenth along the bottom
  await expect(reach.locator("[data-axis=chapters] span")).toHaveText(Array.from({ length: 14 }, (_, index) => `${index + 1}`));
  await expect(reach.locator("[data-axis=x] span").first()).toHaveText("1");
  await expect(reach.locator("[data-axis=x] span").nth(1)).toHaveText("10");

  await page.setViewportSize({ width: 390, height: 844 });
  await reach.scrollIntoViewIfNeeded();
  for (const name of ["Reached", "Finished"]) await expect(reach.getByRole("list", { name: "Legend" }).getByText(name, { exact: true })).toBeInViewport({ ratio: 1 });
  // The arrow keys read the lessons out and scroll the plot to keep the picked one in view; the axis stays where it was
  const axis = reach.getByText("16k", { exact: true });
  const axisAt = await axis.boundingBox();
  await plot.focus();
  await page.keyboard.press("End");
  await expect(reach.getByText(new RegExp(`^Lesson ${lessons}, chapter 14: [\\d.]+k reached, [\\d.]+k finished · Capstone: `))).toBeVisible();
  await expect.poll(() => plot.evaluate(el => el.parentElement!.scrollLeft)).toBeGreaterThan(0);
  expect(await axis.boundingBox()).toEqual(axisAt);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("pointing at a chapter's number reads the chapter out, and at a lesson the lesson, without moving the chart", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(story("course-with-many-lessons"));
  const reach = page.getByRole("region", { name: "Lesson by lesson" });
  await reach.scrollIntoViewIfNeeded();
  const plot = reach.getByRole("group", { name: /^Lessons/ });
  const before = await plot.boundingBox();
  await reach.locator("[data-axis=chapters] span", { hasText: /^3$/ }).hover();
  await expect(reach.getByText(/^Chapter 3 · Modelling the domain: [\d.]+k reached it, [\d.]+k finished it$/)).toBeVisible();
  await page.mouse.move(before!.x + 1, before!.y + 100);
  await expect(reach.getByText(/^Lesson 1, chapter 1: [\d.]+k reached, [\d.]+k finished · Foundations: First steps$/)).toBeVisible();
  expect(await plot.boundingBox()).toEqual(before);
});

test("a course without chapters numbers its lessons alone", async ({ page }) => {
  await page.goto(story("course-without-chapters"));
  const reach = page.getByRole("region", { name: "Lesson by lesson" });
  await expect(reach.getByRole("listitem").filter({ hasText: /^Lesson \d+,/ })).toHaveCount(40);
  await expect(reach.locator("[data-axis=chapters]")).toHaveCount(0);
  await expect(reach.getByRole("listitem").filter({ hasText: /^Chapter / })).toHaveCount(0);
});
