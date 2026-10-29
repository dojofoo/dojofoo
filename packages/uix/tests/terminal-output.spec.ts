import { expect, test } from "@playwright/test";

for (const [story, label, state] of [["running", "Running lesson checks", "Running"], ["passed", "3/3 lesson checks passed", "Passed"], ["failed", "2/3 lesson checks passed", "Failed"]]) {
  test(`terminal output keeps ${story} text, status and wrapping`, async ({ page }) => {
    await page.goto(`/iframe.html?id=components-organisms-terminal-output--${story}&viewMode=story`);
    const output = page.getByRole("region", { name: label, exact: true });
    await expect(output).toBeVisible();
    await expect(output.getByRole("img", { name: state, exact: true })).toBeVisible();
    await expect(output.locator("pre")).toContainText("keeps the input unchanged");
    const colors = await output.getByRole("button", { name: "Copy code", exact: true }).evaluate(node => {
      const probe = document.createElement("span"); probe.style.color = "var(--fluid-muted)"; node.append(probe);
      const result = { actual: getComputedStyle(node).color, expected: getComputedStyle(probe).color }; probe.remove(); return result;
    });
    expect(colors.actual).toBe(colors.expected);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await output.locator("pre").evaluate(node => getComputedStyle(node).whiteSpace)).toBe("pre-wrap");
    expect(await output.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`terminal-${story}-phone.png`), animations: "disabled" });
  });
}
