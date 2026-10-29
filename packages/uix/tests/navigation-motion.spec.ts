import { expect, test } from "@playwright/test";

test("segmented selections keep the document steady and choices use the avatar menu", async ({ page }) => {
  await page.addInitScript(() => {
    const native = document.startViewTransition.bind(document);
    (window as any).__transitionCalls = 0;
    document.startViewTransition = ((options: any) => { (window as any).__transitionCalls++; return native(options); }) as typeof document.startViewTransition;
  });
  await page.goto("/iframe.html?id=pages-dojo--content-window-settings&viewMode=story");
  const settings = page.getByRole("complementary", { name: "Settings", exact: true });
  await settings.getByRole("tab", { name: "Material", exact: true }).click();
  await settings.getByRole("tab", { name: "Code", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__transitionCalls)).toBe(0);
  await settings.getByRole("button", { name: /^Code font size:/ }).click();
  const menu = page.locator(".ui-as-popover.ui-as-menu");
  await expect(menu).toBeVisible();
  const style = await menu.evaluate(element => {
    const style = getComputedStyle(element); return [style.backgroundColor, style.borderRadius, style.boxShadow];
  });
  await page.getByRole("menuitemradio", { name: "14 px", exact: true }).click();
  await expect(settings.getByRole("button", { name: "Code font size: 14 px", exact: true })).toBeFocused();
  await expect(page.locator(".view-lines")).toHaveCSS("font-size", "14px");
  await settings.getByRole("button", { name: "Code font size: 14 px", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: "14 px", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(settings.getByRole("button", { name: "Code font size: 15 px", exact: true })).toBeFocused();
  await settings.getByRole("button", { name: "Code font size: 15 px", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(settings.getByRole("button", { name: "Code font size: 15 px", exact: true })).toBeFocused();
  await page.locator(".ui-as-user").click();
  await expect(menu).toBeVisible();
  expect(await menu.evaluate(element => {
    const style = getComputedStyle(element); return [style.backgroundColor, style.borderRadius, style.boxShadow];
  })).toEqual(style);
});

test("the website course hero stays on its front", async ({ page }) => {
  await page.goto("/iframe.html?id=web-site--course&viewMode=story");
  const card = page.locator(".ui-crp-head__card .ui-course");
  await expect(card).toBeVisible();
  await expect(card.locator("button[aria-label*='show details']")).toHaveCount(0);
  await card.click();
  await expect(card).not.toHaveClass(/ui-card--flip/);
});

test("website and docs navigation use named pane transitions without duplicate calls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const native = document.startViewTransition.bind(document);
    (window as any).__transitions = [];
    document.startViewTransition = ((options: any) => {
      const transition = native(options);
      transition.ready.then(() => {
        (window as any).__transitions.push({ types: Array.from(transition.types), animations: document.getAnimations().map(animation => (animation as CSSAnimation).animationName), markdownReady: Boolean(document.querySelector(".ui-docs .ui-result-markdown")) });
      }).catch(() => {});
      return transition;
    }) as typeof document.startViewTransition;
  });
  await page.goto("/iframe.html?id=web-site--course&viewMode=story");
  await page.getByRole("link", { name: "All courses", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__transitions.length)).toBe(1);
  await page.getByRole("navigation", { name: "Site", exact: true }).getByRole("link", { name: "Help", exact: true }).click();
  await expect(page.locator(".ui-docs-layout > .ui-docs-tree")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__transitions.length)).toBe(2);
  const transitions = await page.evaluate(() => (window as any).__transitions);
  expect(transitions.every((entry: any) => entry.types.includes("ui-navigation"))).toBe(true);
  expect(transitions[0].animations).toContain("ui-main-in");
  expect(transitions[1].animations).toContain("ui-left-in");
  expect(transitions[1].markdownReady).toBe(true);
});

test("slide controls sit below the deck and enforce first and last slide bounds", async ({ page }) => {
  await page.goto("/iframe.html?id=pages-dojo--learner-slides&viewMode=story");
  const navigation = page.getByRole("navigation", { name: "Slide navigation", exact: true });
  const previous = navigation.getByRole("button", { name: "Previous slide", exact: true });
  const next = navigation.getByRole("button", { name: "Next slide", exact: true });
  await expect(navigation.getByLabel("Slide progress", { exact: true })).toHaveText("1 / 3");
  const progress = page.getByRole("progressbar", { name: "Slide completion", exact: true });
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(progress).toHaveAttribute("aria-valuemax", "3");
  await expect(previous).toHaveText("Previous");
  await expect(next).toHaveText("Next");
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(navigation.getByLabel("Slide progress", { exact: true })).toHaveText("2 / 3");
  await next.click();
  await expect(navigation.getByLabel("Slide progress", { exact: true })).toHaveText("3 / 3");
  await expect(progress).toHaveAttribute("aria-valuenow", "3");
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(navigation.getByLabel("Slide progress", { exact: true })).toHaveText("2 / 3");
  const frame = (await page.getByTitle("Objects · Slidev").boundingBox())!;
  expect(Math.abs(frame.width / frame.height - 16 / 9)).toBeLessThan(.01);
  const controls = (await navigation.boundingBox())!;
  expect(controls.y).toBeGreaterThanOrEqual(frame.y + frame.height - 1);
  const counter = (await navigation.getByLabel("Slide progress", { exact: true }).boundingBox())!;
  expect(Math.abs(counter.x + counter.width / 2 - (controls.x + controls.width / 2))).toBeLessThan(1);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileFrame = (await page.getByTitle("Objects · Slidev").boundingBox())!;
  expect(Math.abs(mobileFrame.width / mobileFrame.height - 16 / 9)).toBeLessThan(.01);
});

for (const reducedMotion of ["reduce", "no-preference"] as const) test(`pane transitions keep their direction and respect ${reducedMotion}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion });
  await page.addInitScript(() => {
    const native = document.startViewTransition.bind(document);
    (window as any).__panes = [];
    document.startViewTransition = ((options: any) => {
      const transition = native(options);
      transition.ready.then(() => {
        const animations = document.getAnimations().filter(animation => /ui-(right|settings)-(in|out)|ui-view-fade/.test((animation as CSSAnimation).animationName));
        (window as any).__panes.push({
          types: Array.from(transition.types),
          names: animations.map(animation => (animation as CSSAnimation).animationName),
          transforms: animations.flatMap(animation => (animation.effect as KeyframeEffect).getKeyframes().map(frame => frame.transform ?? "none")),
          sidebarClass: getComputedStyle(document.querySelector(".ui-as-side")!).viewTransitionClass,
        });
      }).catch(() => {});
      return transition;
    }) as typeof document.startViewTransition;
  });
  await page.goto("/iframe.html?id=pages-dojo--learner-kata&viewMode=story");
  await page.getByRole("button", { name: "Show settings", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__panes.length)).toBe(1);
  const pane = await page.evaluate(() => (window as any).__panes[0]);
  expect(pane.types).toEqual(["ui-pane"]);
  if (reducedMotion === "reduce") {
    expect(pane.names).toContain("ui-view-fade-in");
    expect(pane.names).not.toContain("ui-right-in");
    expect(pane.transforms.every((value: string) => value === "none")).toBe(true);
  } else {
    expect(pane.names).toContain("ui-settings-in");
    expect(pane.names).toContain("ui-view-fade-out");
    expect(pane.transforms).toContain("translateX(-100%)");
    expect(pane.transforms.some((value: string) => value.includes("scale("))).toBe(false);
  }
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__panes.length)).toBe(2);
  expect(await page.evaluate(() => (window as any).__panes[1].sidebarClass)).toBe("ui-left");
  await expect.poll(() => page.locator(".ui-as-side").evaluate(element => element.getBoundingClientRect().width)).toBe(64);
  await page.getByRole("button", { name: "Hide settings", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__panes.length)).toBe(3);
  const closing = await page.evaluate(() => (window as any).__panes[2]);
  if (reducedMotion === "no-preference") {
    expect(closing.names).toContain("ui-settings-out");
    expect(closing.transforms).toContain("translateX(-100%)");
    expect(closing.transforms.some((value: string) => value.includes("scale("))).toBe(false);
  } else expect(closing.transforms.every((value: string) => value === "none")).toBe(true);
});
