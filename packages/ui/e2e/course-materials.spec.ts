import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("authored material uses the UIX video player and keeps existing asset and embed boundaries", async ({ page }) => {
  const clip = await readFile(new URL("../../uix/public/fixtures/lesson-video.webm", import.meta.url));
  const writes: string[] = [];
  await page.addInitScript(() => localStorage.setItem("uix:content-preferences", JSON.stringify({ video: { speed: 1.5 } })));
  await page.route("**/api/**", route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET" && url.pathname !== "/api/teaching/preview") writes.push(url.pathname);
    if (url.pathname === "/api/interactive/asset") {
      expect(url.searchParams.get("workspace")).toBe("material-workspace");
      expect(url.searchParams.get("course")).toBe("materials");
      if (url.searchParams.get("path") === "lessons/first/clip.webm") return route.fulfill({ contentType: "video/webm", body: clip });
      if (url.searchParams.get("path") === "lessons/first/demo.html") return route.fulfill({ contentType: "text/html", body: "<p>Sandboxed example</p>" });
      return route.fulfill({ contentType: "text/plain", body: "Course notes" });
    }
    if (url.pathname.endsWith("/interactive/conversation")) return route.fulfill({ json: { sessionId: null, messages: [], model: null } });
    if (url.pathname.endsWith("/interactive")) return route.fulfill({ json: {
      dojo: "materials", title: "Course materials", lessonTitle: "Materials", step: 0, totalSteps: 1, complete: false, response: null,
      current: { id: "first", type: "present", title: "Materials", contentBase: "lessons/first", content: String.raw`<Video src="clip.webm" title="Lesson video" />
<Artifact src="notes.txt" title="Course notes" />
<Interactive src="demo.html" title="Sandboxed example" />
<RegexWorkbench input="hello  world" pattern="\s+" flags="g" replacement=" " />
<Video title="Missing source" />` },
    } });
    if (url.pathname === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/interactive?workspace=material-workspace&course=materials");
  const player = page.locator(".ui-vs");
  await expect(player).toBeVisible();
  const video = player.locator("video");
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.readyState)).toBeGreaterThanOrEqual(1);
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.playbackRate)).toBe(1.5);
  expect(await page.locator(".ui-vs__light").count()).toBe(0);
  const box = await player.boundingBox();
  expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1);
  await player.hover();
  const controls = player.getByRole("group", { name: "Player controls", exact: true });
  await controls.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeGreaterThan(0);
  await controls.getByRole("button", { name: "Pause", exact: true }).click();
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
  const download = page.getByRole("link", { name: "Course notes", exact: true });
  await expect(download).toHaveAttribute("href", "/api/interactive/asset?workspace=material-workspace&path=lessons%2Ffirst%2Fnotes.txt&course=materials&download=1");
  await expect(page.locator('iframe[title="Sandboxed example"]')).toHaveAttribute("sandbox", "allow-scripts");
  await expect(page.frameLocator('iframe[title="Sandboxed example"]').getByText("Sandboxed example", { exact: true })).toBeVisible();
  await expect(page.getByRole("figure", { name: "Regex workbench", exact: true })).toContainText('"hello world"');
  await expect(page.getByRole("alert").filter({ hasText: "Video requires a src attribute." })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("course-materials-desktop.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await player.scrollIntoViewIfNeeded();
  const phone = await player.boundingBox();
  expect(phone!.width / phone!.height).toBeCloseTo(16 / 9, 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("course-materials-phone.png"), animations: "disabled" });
  await page.getByRole("figure", { name: "Regex workbench", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("course-workbench-phone.png"), animations: "disabled" });
  expect(writes).toEqual([]);
});
