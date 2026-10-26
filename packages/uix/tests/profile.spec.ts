import { expect, test } from "@playwright/test";

test("General reuses onboarding profile fields and retains saved values across tabs", async ({ page }) => {
  await page.goto("/iframe.html?id=pages-dojo--settings&viewMode=story");
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await expect(page.getByRole("group", { name: "Profile photo", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload profile photo", exact: true })).toHaveCSS("corner-shape", /^(round|superellipse\(1\))$/);
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Dana Park");
  await page.getByRole("textbox", { name: "Handle", exact: true }).fill("danapark");
  await expect(page.getByText("dojo.foo/u/danapark is yours", { exact: true })).toBeVisible();
  const save = page.getByRole("button", { name: "Save changes", exact: true });
  await save.click();
  await expect(save).toBeDisabled();
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Dana Park");
  await expect(page.getByRole("textbox", { name: "Handle", exact: true })).toHaveValue("danapark");
  await page.getByRole("textbox", { name: "Handle", exact: true }).fill("admin");
  await expect(page.getByText("Taken – try another", { exact: true })).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Handle", exact: true })).toHaveValue("danapark");
  await expect(page.getByText("Sample photos", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Try failure", { exact: true })).toHaveCount(0);
});

test("General crops a chosen photo, supports keyboard zoom and removes the crop", async ({ page }) => {
  await page.goto("/iframe.html?id=pages-dojo--settings&viewMode=story");
  await page.getByRole("tab", { name: "General", exact: true }).click();
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 300; canvas.height = 180;
    const context = canvas.getContext("2d")!; context.fillStyle = "#ff005c"; context.fillRect(0, 0, 300, 180);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const file = { name: "chosen-photo.png", mimeType: "image/png", buffer: Buffer.from(data, "base64") };
  const input = page.locator('input[type="file"]');
  await input.setInputFiles(file);
  const crop = page.getByRole("group", { name: /^Crop area, zoom/ });
  await expect(crop).toBeFocused();
  await crop.press("+");
  await expect(crop).toHaveAccessibleName(/^Crop area, zoom 120%/);
  await crop.press("Escape");
  await expect(crop).toHaveCount(0);
  await input.setInputFiles(file);
  await page.getByRole("button", { name: "Save photo", exact: true }).click();
  await expect(page.getByText("Photo updated", { exact: true })).toBeVisible();
  const photo = page.getByRole("group", { name: "Profile photo", exact: true }).locator("img");
  expect(await photo.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(512);
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await expect(photo).toBeVisible();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(photo).toHaveCount(0);
  await expect(page.getByText("Photo removed", { exact: true })).toBeVisible();
});

test("settings help sits alongside every tab and stacks on phones", async ({ page }) => {
  await page.goto("/iframe.html?id=pages-dojo--settings&viewMode=story");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 900) await expect(page.locator(".ui-as-app")).toHaveAttribute("data-narrow", "true");
    else await expect(page.locator(".ui-as-app")).not.toHaveAttribute("data-narrow");
    for (const tab of ["General", "Members", "Appearance", "API keys"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      const help = page.getByRole("complementary", { name: `About ${tab}`, exact: true });
      await expect(help).toBeVisible();
      const contentBox = (await page.locator(".ui-sb__content").boundingBox())!;
      const helpBox = (await help.boundingBox())!;
      if (width > 900) expect(helpBox.x).toBeGreaterThan(contentBox.x + contentBox.width);
      else expect(helpBox.y).toBeGreaterThanOrEqual(contentBox.y + contentBox.height - 1);
    }
  }
});
