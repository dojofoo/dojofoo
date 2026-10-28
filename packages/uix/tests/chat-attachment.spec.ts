import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`received attachments remain usable within a narrow ${theme} conversation`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 700 });
    const open = (story: string) => page.goto(`/iframe.html?id=components-molecules-chat-attachment--${story}&viewMode=story&globals=theme:${theme}`);
    await open("long-filename");
    const image = page.getByRole("img");
    await expect(image).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`attachment-${theme}.png`) });
    await open("audio");
    await expect(page.locator("audio")).toHaveAttribute("controls", "");
    await open("video");
    await expect(page.locator("video")).toHaveAttribute("controls", "");
    await open("document");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Course guidance.md", exact: true }).click();
    expect((await download).suggestedFilename()).toBe("Course guidance.md");
    await open("provider-file");
    await expect(page.getByText("Course guidance.pdf", { exact: true })).toBeVisible();
    await expect(page.getByText("Preview unavailable", { exact: true })).toBeVisible();
    await expect(page.getByRole("link")).toHaveCount(0);
  });
}
