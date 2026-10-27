import { expect, test, type Page } from "@playwright/test";

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("button", { name: new RegExp(`^${label}:`) }).click();
  await page.getByRole("menuitemradio", { name: option, exact: true }).click();
}

test("content settings replace the brief and apply code preferences without losing edits", async ({ page }) => {
  await page.goto("/iframe.html?id=pages-dojo--learner-kata&viewMode=story");
  const code = page.getByRole("textbox", { name: "Code editor", exact: true });
  await code.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n// settings keep this draft " + "wrapped ".repeat(50));
  await page.getByRole("button", { name: "Show settings", exact: true }).click();
  const settings = page.getByRole("complementary", { name: "Settings", exact: true });
  await expect(settings.getByRole("tab", { name: "Code", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(settings.getByRole("tab", { name: "Material", exact: true })).toBeVisible();
  await expect(settings.getByRole("tab", { name: "Sensei", exact: true })).toHaveCount(0);
  await settings.getByRole("switch", { name: "Line numbers", exact: true }).click();
  await expect(page.locator(".monaco-editor .line-numbers")).toHaveCount(0);
  await choose(page, "Code font size", "14 px");
  await expect(page.locator(".view-lines")).toHaveCSS("font-size", "14px");
  const unwrapped = await page.locator(".view-lines .view-line").count();
  await settings.getByRole("switch", { name: "Line wrapping", exact: true }).click();
  await expect.poll(() => page.locator(".view-lines .view-line").count()).toBeGreaterThan(unwrapped);
  await expect(settings.getByRole("switch", { name: "Line wrapping", exact: true })).toBeChecked();
  await expect(page.locator(".view-lines")).toContainText("// settings keep this draft");
  await page.reload();
  await page.getByRole("button", { name: "Show settings", exact: true }).click();
  await expect(settings.getByRole("switch", { name: "Line wrapping", exact: true })).toBeChecked();
  await expect(settings.getByRole("switch", { name: "Line numbers", exact: true })).not.toBeChecked();
  await settings.getByRole("button", { name: "Reset Code defaults", exact: true }).click();
  await expect(settings.getByRole("switch", { name: "Line numbers", exact: true })).toBeChecked();
  await expect(page.locator(".view-lines")).toHaveCSS("font-size", "16.5px");
});

test("material settings change reading and resource presentation", async ({ page }) => {
  await page.goto("/iframe.html?id=components-organisms-content-settings--material&viewMode=story");
  const settings = page.getByRole("complementary", { name: "Settings", exact: true });
  await settings.getByRole("tab", { name: "Material", exact: true }).click();
  await choose(page, "Text size", "Large");
  await expect(page.locator(".ui-lb")).toHaveCSS("font-size", "17px");
  const comfortable = (await page.locator(".ui-lb__body").boundingBox())!.width;
  await choose(page, "Reading width", "Wide");
  await expect.poll(async () => (await page.locator(".ui-lb__body").boundingBox())!.width).toBeGreaterThan(comfortable);
  await choose(page, "Resources", "Side panel");
  await expect(page.locator(".ui-lb")).toHaveAttribute("data-resources", "panel");
  await settings.getByRole("switch", { name: "Resource previews", exact: true }).click();
  await expect(page.getByRole("link", { name: /TypeScript Handbook/ })).toBeHidden();
  await page.getByText("Resources (1)", { exact: true }).click();
  await expect(page.getByRole("link", { name: /TypeScript Handbook/ })).toBeVisible();
});

test("video defaults update the media element and resume a saved position", async ({ page }) => {
  await page.goto("/iframe.html?id=pages-dojo--learner-intro&viewMode=story");
  await expect.poll(() => page.locator(".ui-vs__light").count()).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Show settings", exact: true }).click();
  const settings = page.getByRole("complementary", { name: "Settings", exact: true });
  await expect(settings.getByRole("tab", { name: "Video", exact: true })).toHaveAttribute("aria-selected", "true");
  await choose(page, "Playback speed", "1.5×");
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.playbackRate)).toBe(1.5);
  await expect(settings.getByRole("switch", { name: "Autoplay next video", exact: true })).not.toBeChecked();
  await page.locator("video").evaluate((video: HTMLVideoElement) => {
    Object.defineProperty(video, "duration", { configurable: true, value: 10 });
    localStorage.setItem(`uix:video-position:${video.getAttribute("src")}`, "4");
    video.dispatchEvent(new Event("loadedmetadata"));
    video.addTextTrack("captions", "English", "en");
  });
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime)).toBe(4);
  await page.locator("video").evaluate((video: HTMLVideoElement) => { video.currentTime = 6; video.dispatchEvent(new Event("timeupdate")); });
  expect(await page.locator("video").evaluate((video: HTMLVideoElement) => localStorage.getItem(`uix:video-position:${video.getAttribute("src")}`))).toBe("6");
  await settings.getByRole("switch", { name: "Resume playback", exact: true }).click();
  await page.locator("video").evaluate((video: HTMLVideoElement) => { video.currentTime = 7; video.dispatchEvent(new Event("timeupdate")); });
  await settings.getByRole("switch", { name: "Resume playback", exact: true }).click();
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime)).toBe(7);
  await settings.getByRole("switch", { name: "Captions", exact: true }).click();
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.textTracks[0].mode)).toBe("showing");
  await settings.getByRole("switch", { name: "Autoplay next video", exact: true }).click();
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.autoplay)).toBe(true);
});

test("slide settings control the built deck and show its real thumbnails", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/iframe.html?id=pages-dojo--learner-slides&viewMode=story");
  await page.getByRole("button", { name: "Show settings", exact: true }).click();
  const settings = page.getByRole("complementary", { name: "Settings", exact: true });
  await expect(settings.getByRole("tab", { name: "Slides", exact: true })).toHaveAttribute("aria-selected", "true");
  const deck = page.frameLocator('iframe[title="Objects · Slidev"]');
  const navigation = page.getByRole("navigation", { name: "Slide navigation", exact: true });
  await expect(navigation.getByLabel("Slide progress", { exact: true })).toHaveText(/1 \/ 3/);
  await settings.getByRole("switch", { name: "Slide thumbnails", exact: true }).click();
  await expect(deck.getByRole("navigation", { name: "Slide thumbnails", exact: true })).toBeVisible();
  await deck.getByRole("button", { name: "Go to slide 2", exact: true }).click();
  await expect(navigation.getByLabel("Slide progress", { exact: true })).toHaveText(/2 \/ 3/);
  await settings.getByRole("switch", { name: "Slide progress", exact: true }).click();
  await expect(navigation.getByLabel("Slide progress", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("progressbar", { name: "Slide completion", exact: true })).toHaveCount(0);
  await choose(page, "Slide fit", "Fit to width");
  await expect(page.locator(".ui-slide-deck")).toHaveAttribute("data-fit", "width");
  await settings.getByRole("switch", { name: "Reduced slide motion", exact: true }).click();
  await expect(deck.locator("html")).toHaveAttribute("data-dojo-reduced-motion");
});

test("inline lesson video uses shared controls without projecting light onto scrolled material", async ({ page }) => {
  await page.goto("/iframe.html?id=components-organisms-video-stage--inline&viewMode=story");
  const stage = page.locator(".ui-vs");
  const video = stage.locator("video");
  await expect(stage).toBeVisible();
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.readyState)).toBeGreaterThanOrEqual(1);
  await stage.hover();
  const controls = stage.getByRole("group", { name: "Player controls", exact: true });
  await controls.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeGreaterThan(0);
  await controls.getByRole("button", { name: "Pause", exact: true }).click();
  expect(await page.locator(".ui-vs__light").count()).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await stage.boundingBox();
  expect(bounds!.width / bounds!.height).toBeCloseTo(16 / 9, 1);
});
