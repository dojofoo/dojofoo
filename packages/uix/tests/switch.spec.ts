import { expect, test } from "@playwright/test";

test("switch states stay round and work with keyboard in both modes and every theme", async ({ page, request }) => {
  await page.goto("/iframe.html?id=components-atoms-switch--states&viewMode=story");
  const switches = page.getByRole("switch");
  await expect(switches).toHaveCount(8);
  const themes = await (await request.get("/src/styles/themes/catalog.json")).json();
  for (const theme of ["dojofoo", ...themes.map((item: { id: string }) => item.id)]) {
    await page.locator("html").evaluate((element, value) => { element.setAttribute("data-ui-theme", value); element.toggleAttribute("data-ui-derive", value !== "dojofoo"); }, theme);
    const shapes = await switches.evaluateAll(elements => elements.map(element => {
      const track = getComputedStyle(element), thumb = getComputedStyle(element, "::after");
      return { trackShape: track.getPropertyValue("corner-shape"), radius: parseFloat(track.borderRadius), height: parseFloat(track.height), thumbShape: thumb.getPropertyValue("corner-shape"), thumbRadius: thumb.borderRadius };
    }));
    for (const shape of shapes) {
      expect(shape.trackShape, theme).toMatch(/^(round|superellipse\(1\))$/);
      expect(shape.radius, theme).toBeGreaterThanOrEqual(shape.height / 2);
      expect(shape.thumbShape, theme).toMatch(/^(round|superellipse\(1\))$/);
      expect(shape.thumbRadius, theme).toBe("50%");
    }
  }
  const toggle = page.getByRole("switch", { name: "light off", exact: true });
  await toggle.focus();
  await toggle.press("Space");
  await expect(toggle).toBeChecked();
  await toggle.press("Enter");
  await expect(toggle).not.toBeChecked();
  await expect(page.getByRole("switch", { name: "dark disabled on", exact: true })).toBeDisabled();
  await expect(page.getByRole("switch", { name: "dark disabled on", exact: true })).toBeChecked();
});

test("theme sandbox uses the shared switch in both modes", async ({ page }) => {
  await page.goto("/iframe.html?id=templates-theme-sandbox--sandbox&viewMode=story");
  const toggles = page.getByRole("switch", { name: "Switch", exact: true });
  await expect(toggles).toHaveCount(2);
  for (const toggle of await toggles.all()) {
    await expect(toggle).toHaveClass(/ui-switch/);
    await expect(toggle).toHaveCSS("corner-shape", /^(round|superellipse\(1\))$/);
    await toggle.click();
    await expect(toggle).not.toBeChecked();
  }
});
