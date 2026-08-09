import { expect, test } from "@playwright/test";

test("switches lesson accordions without blocking the main thread", async ({ page }) => {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  await page.goto("/");
  const trigger = page.locator('[data-lesson-state="upcoming"] button').first();
  await trigger.waitFor();
  await page.waitForTimeout(500);

  const sample = await trigger.evaluate(async (button) => {
    const longTasks: number[] = [];
    const observer = new PerformanceObserver((list) => {
      longTasks.push(...list.getEntries().map((entry) => entry.duration));
    });
    observer.observe({ type: "longtask" });

    const frameDurations: number[] = [];
    let previousFrame = performance.now();
    let sampling = true;
    const sampleFrame = (now: number) => {
      frameDurations.push(now - previousFrame);
      previousFrame = now;
      if (sampling) requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);

    (button as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    sampling = false;
    observer.disconnect();

    return {
      expanded: button.getAttribute("aria-expanded"),
      longTasks,
      framesOver32ms: frameDurations.filter((duration) => duration > 32).length,
      maxFrameMs: Math.max(...frameDurations),
    };
  });

  expect(sample.expanded).toBe("true");
  expect(sample.longTasks, JSON.stringify(sample)).toHaveLength(0);
  expect(sample.framesOver32ms, JSON.stringify(sample)).toBeLessThanOrEqual(1);
  expect(sample.maxFrameMs, JSON.stringify(sample)).toBeLessThan(70);
});
