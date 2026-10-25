import { expect, test } from "@playwright/test";

for (const theme of ["dark", "light"]) {
  test(`tool call running and failure controls keep the same shape in ${theme}`, async ({ page }) => {
    for (const status of ["running", "error"]) {
      await page.goto(`/iframe.html?id=components-tool-call-card--default&viewMode=story&globals=theme:${theme}&args=status:${status}`);
      const head = page.locator(".ui-tc__head");
      await head.click();
      await expect(head).toHaveAttribute("aria-expanded", "true");
      const target = status === "error" ? page.getByRole("button", { name: "Retry", exact: true }) : head;
      await target.hover();
      if (await page.evaluate(() => CSS.supports("corner-shape", "squircle"))) {
        expect(await target.evaluate(element => getComputedStyle(element).getPropertyValue("corner-shape")))
          .toMatch(/^(squircle|superellipse\(2\))$/);
      }
    }
  });

  test(`tool call hover, focus and expanded edges remain squircles in ${theme}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=components-tool-call-card--default&viewMode=story&globals=theme:${theme}`);
    const head = page.locator(".ui-tc__head");
    await expect(head).toBeVisible();
    await head.hover();
    await expect.poll(() => head.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    const check = async (open: boolean, native = true) => {
      const corners = await head.evaluate(element => {
        const style = getComputedStyle(element), parent = getComputedStyle(element.parentElement!);
        return { supported: CSS.supports("corner-shape", "squircle"), shape: style.getPropertyValue("corner-shape"),
          parentShape: parent.getPropertyValue("corner-shape"), top: style.borderTopLeftRadius,
          parentTop: parent.borderTopLeftRadius, bottom: style.borderBottomLeftRadius };
      });
      expect(corners.shape).toBe(corners.parentShape);
      if (native && corners.supported) expect(corners.shape).toMatch(/^(squircle|superellipse\(2\))$/);
      expect(corners.top).toBe(corners.parentTop);
      expect(corners.bottom).toBe(open ? "0px" : corners.parentTop);
    };
    await check(false);
    await head.focus();
    await page.keyboard.press("Enter");
    await expect(head).toHaveAttribute("aria-expanded", "true");
    await check(true);
    const copy = page.locator(".ui-tc__copy").first();
    await copy.hover();
    if (await page.evaluate(() => CSS.supports("corner-shape", "squircle"))) {
      expect(await copy.evaluate(element => getComputedStyle(element).getPropertyValue("corner-shape")))
        .toMatch(/^(squircle|superellipse\(2\))$/);
    }
    await head.click();
    await check(false);
    await page.addStyleTag({ content: ":root, .light, .dark { --squircle-factor: 1 !important; } *, ::before, ::after { corner-shape: round !important; }" });
    await expect.poll(() => head.evaluate(element => getComputedStyle(element).borderTopLeftRadius)).toBe("12px");
    await check(false, false);
  });

  test(`active stories have no accidentally round surfaces in ${theme}`, async ({ page, request }) => {
    const { entries } = await (await request.get("/index.json")).json();
    const ids = Object.keys(entries).filter(id => /^(pages|components|templates)-/.test(id) && entries[id].type === "story");
    const failures: string[] = [];
    for (const id of ids) {
      await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`);
      await expect(page.locator("#storybook-root")).not.toBeEmpty();
      await expect(page.locator(".sb-errordisplay")).not.toBeVisible();
      if (!await page.evaluate(() => CSS.supports("corner-shape", "squircle"))) continue;
      const round = await page.locator("#storybook-root").evaluate(root => {
        const failures: string[] = [];
        for (const element of root.querySelectorAll<HTMLElement>("*")) {
          if (!(element instanceof HTMLElement) || element.closest(".monaco-editor")) continue;
          for (const pseudo of [null, "::before", "::after"]) {
            const style = getComputedStyle(element, pseudo);
            if (pseudo && ["none", "normal"].includes(style.content)) continue;
            const bounds = element.getBoundingClientRect();
            if (!bounds.width || !bounds.height || style.visibility === "hidden" || style.display === "none") continue;
            const isRound = /^(round|superellipse\(1\))$/.test(style.getPropertyValue("corner-shape"));
            if (element.classList.contains("rounded-full") && !isRound) {
              failures.push(`expected circle: ${element.className}${pseudo ?? ""}`);
            }
            const radius = Math.max(...[style.borderTopLeftRadius, style.borderTopRightRadius,
              style.borderBottomLeftRadius, style.borderBottomRightRadius].map(parseFloat));
            // Genuine circular dots, avatars and fully rounded pills remain round.
            if (radius <= 0 || radius >= Math.min(bounds.width, bounds.height) / 2) continue;
            if (isRound) failures.push(`${element.className}${pseudo ?? ""}`);
          }
        }
        return [...new Set(failures)];
      });
      failures.push(...round.map(selector => `${id}: ${selector}`));
    }
    expect(failures).toEqual([]);
  });
}
