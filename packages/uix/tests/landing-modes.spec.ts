import { expect, test } from "@playwright/test";

const landing = "/iframe.html?id=web-site--landing&viewMode=story";

test("mode windows, carousel controls and keyboard selection stay synchronized on desktop and phone", async ({ page }) => {
  await page.goto(landing);
  const section = page.locator(".ui-land-modes");
  const carousel = page.getByRole("region", { name: "Learning modes", exact: true });
  await expect(carousel.getByRole("tab", { name: "Interview Mode", exact: true })).toHaveAttribute("aria-selected", "true");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await section.getByRole("button", { name: "Authoring Mode", exact: true }).click({ position: { x: 16, y: 12 } });
    await expect(carousel.getByRole("tab", { name: "Authoring Mode", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(carousel.getByRole("heading", { name: "Create your own tutor-guided learning or interview", exact: true })).toBeVisible();
    await carousel.getByRole("tab", { name: "Course Mode", exact: true }).click();
    await expect(section.getByRole("button", { name: "Course Mode", exact: true })).toHaveAttribute("aria-pressed", "true");
    await section.getByRole("button", { name: "Interview Mode", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(carousel.getByRole("tab", { name: "Interview Mode", exact: true })).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(carousel.getByRole("button", { name: "Pause slide rotation", exact: true })).toHaveCount(0);
});

test("autoplay keeps advancing on hover with synchronized windows and indicators only", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(landing);
  const carousel = page.getByRole("region", { name: "Learning modes", exact: true });
  await carousel.scrollIntoViewIfNeeded();
  await expect(carousel.getByRole("tab", { name: "Interview Mode", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.mouse.click(5, 5);
  await carousel.getByRole("group", { name: "Slides", exact: true }).hover();
  await expect(carousel.getByRole("tab", { name: "Course Mode", exact: true })).toHaveAttribute("aria-selected", "true", { timeout: 12_000 });
  await expect(page.locator(".ui-land-modes").getByRole("button", { name: "Course Mode", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(carousel.getByRole("heading", { name: "Learn anything with a tutor next to you", exact: true })).toBeVisible();
  await expect(carousel.getByRole("button")).toHaveCount(0);
  await expect(page.getByText("Three modes", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the active indicator fills with its slide timer and the text has horizontal edge fades", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(landing);
  const carousel = page.getByRole("region", { name: "Learning modes", exact: true });
  await carousel.scrollIntoViewIfNeeded();
  await page.mouse.click(5, 5);
  const viewport = carousel.getByRole("group", { name: "Slides", exact: true });
  await expect(viewport).toHaveCSS("mask-image", /linear-gradient\(to right/);
  const active = carousel.getByRole("tab", { selected: true });
  const fill = active.locator('[class*="dotFill"]');
  // How much of its pill the fill covers: it slides in from the left (never scaled), a full dot at the start
  const amount = () => fill.evaluate(node => {
    const pill = node.parentElement!.getBoundingClientRect(), own = node.getBoundingClientRect();
    // Until the dot has stretched into its pill there's nothing to read
    if (pill.width < 20) return 0;
    return (Math.min(own.right, pill.right) - pill.left) / pill.width;
  });
  await expect.poll(amount).toBeGreaterThan(.3);
  const before = await amount();
  expect(before).toBeLessThan(.8);
  await expect.poll(amount).toBeGreaterThan(before + .1);
  const color = await fill.evaluate(node => getComputedStyle(node).backgroundColor);
  expect(color).toBe(await carousel.evaluate(node => {
    const sample = document.createElement("i");
    sample.style.color = "var(--brand)";
    node.append(sample);
    const color = getComputedStyle(sample).color;
    sample.remove();
    return color;
  }));
  await expect(carousel.getByRole("tab", { name: "Course Mode", exact: true })).toHaveAttribute("aria-selected", "true", { timeout: 12_000 });
  await expect.poll(amount).toBeLessThan(.45);
});
