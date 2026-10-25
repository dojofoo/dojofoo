import { expect, test } from "@playwright/test";

const pages = ["installation-setup", "learner-intro", "learner-kata", "learner-slides", "course-authoring", "certificates", "explore"];

test("the page catalog is small; originals and animated controls are archived", async ({ request }) => {
  const { entries } = await (await request.get("/index.json")).json();
  const ids = Object.keys(entries);
  expect(ids.filter(id => id.startsWith("pages-"))).toEqual(pages.map(name => `pages-dojo--${name}`));
  expect(ids.some(id => id.includes("materials"))).toBe(false);
  expect(ids).toContain("templates-theme-sandbox--sandbox");
  expect(ids).toContain("archive-animated-controls-button--confetti-story");
  expect(ids).toContain("archive-affectui--onboarding");
});

for (const theme of ["dark", "light"]) {
  test(`featured course corners stay calibrated across every layer in ${theme}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=pages-dojo--explore&viewMode=story&globals=theme:${theme}`);
    await expect(page.getByRole("list", { name: "Featuring" })).toBeVisible();
    const read = () => page.evaluate(() => {
      const feature = document.querySelector(".lj-top__box")!;
      const card = feature.querySelector(".ui-card")!;
      const styles = [feature, card, ...card.querySelectorAll(".ui-card__face"),
        ...card.querySelectorAll("[class*='rounded-']"), feature.querySelector(".lj-installed")!];
      return {
        supported: CSS.supports("corner-shape", "squircle"),
        corners: styles.map(element => {
          const style = getComputedStyle(element);
          return { radius: parseFloat(style.borderTopLeftRadius), shape: style.getPropertyValue("corner-shape") };
        }),
      };
    });
    const native = await read();
    await page.addStyleTag({ content: ":root, .light, .dark { --squircle-factor: 1 !important; } *, ::before, ::after { corner-shape: round !important; }" });
    await expect.poll(async () => (await read()).corners[0].radius).toBe(16);
    const fallback = await read();
    expect(fallback.corners[0].radius).toBe(16);
    expect(fallback.corners.at(-1)!.radius).toBe(8);
    for (let i = 0; i < native.corners.length; i++) {
      expect(fallback.corners[i].radius).toBeGreaterThan(0);
      if (native.supported) {
        expect(native.corners[i].shape).toMatch(/^(squircle|superellipse\(2\))$/);
        expect(native.corners[i].radius * (1 - 0.5 ** 0.25))
          .toBeCloseTo(fallback.corners[i].radius * (1 - Math.SQRT1_2), 3);
      }
    }
  });

  for (const name of pages) test(`${name} mounts in ${theme}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/iframe.html?id=pages-dojo--${name}&viewMode=story&globals=theme:${theme}`);
    await expect(page.locator("#storybook-root").locator(".ui-as")).toBeVisible();
    await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /h-full/);
    await expect(page.locator("#storybook-root")).not.toHaveText("");
    await expect(page.locator(".sb-errordisplay")).not.toBeVisible();
    if (name === "learner-kata") {
      await expect(page.getByRole("textbox", { name: "Code editor", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Show evals", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Close .*kata/ })).toHaveCount(0);
    }
    if (name === "learner-slides") {
      await expect(page.getByTitle("Objects · Slidev")).toHaveAttribute("src", "/slides/index.html?embedded=true");
      await expect(page.frameLocator('iframe[title="Objects · Slidev"]').getByRole("heading", { name: "One pass, one useful value", exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("authoring opens, edits, saves and closes files while the conversation stays", async ({ page }) => {
  await page.goto("/iframe.html?id=pages-dojo--course-authoring&viewMode=story");
  await expect(page.getByRole("tab", { name: "dojo.yaml", exact: true })).toBeVisible();
  const code = page.getByRole("textbox", { name: "Code editor", exact: true });
  await code.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n# saved preview edit");
  await expect(page.getByRole("tab", { name: /dojo.yaml.*unsaved changes/ })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("tab", { name: "dojo.yaml", exact: true })).toBeVisible();
  await expect(page.locator(".view-lines")).toContainText("# saved preview edit");
  await page.getByRole("button", { name: "Everyday TypeScript", exact: true }).click();
  await page.getByRole("button", { name: "DOJO.md", exact: true }).first().click();
  const guidance = page.getByRole("tab", { name: "DOJO.md", exact: true });
  await expect(guidance).toBeVisible();
  await guidance.press("Alt+ArrowLeft");
  await expect(page.getByRole("tab").first()).toHaveText("DOJO.md");
  await page.getByRole("button", { name: "Close dojo.yaml", exact: true }).click();
  await expect(page.getByRole("tab", { name: "dojo.yaml", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Course conversation", exact: true })).toBeVisible();
});

test("editor supports undo, coverage, line references, read-only files and keyboard save", async ({ page }) => {
  await page.goto("/iframe.html?id=components-editor--playground&viewMode=story");
  const code = page.getByRole("textbox", { name: "Code editor", exact: true });
  await expect(code).toBeVisible();
  await code.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n// trial edit");
  await expect(page.getByText("Unsaved edits · ⌘/Ctrl S", { exact: true })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo edit" }).click();
  await expect(page.locator(".view-lines")).not.toContainText("// trial edit");
  await page.getByRole("button", { name: "Highlight lines" }).click();
  await expect(page.locator(".ui-ed-line-flash").first()).toBeVisible();
  await expect(page.locator(".ui-ed-number-covered").first()).toBeVisible();
  await expect(page.locator(".ui-ed-number-failed").first()).toBeVisible();
  await page.goto("/iframe.html?id=components-editor--playground&viewMode=story&args=readOnly:true");
  const readOnly = page.getByRole("textbox", { name: "Code editor", exact: true });
  await readOnly.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("// forbidden edit");
  await expect(page.locator(".view-lines")).not.toContainText("// forbidden edit");
});

test("documentation uses the language API, highlighted examples and reference links", async ({ page }) => {
  let requested = false;
  await page.route(url => url.pathname === "/uix-hover", async route => {
    requested = true;
    const body = route.request().postDataJSON();
    expect(body.filePath).toBe("kata.ts");
    const from = body.code.indexOf("positive", body.code.indexOf("export function"));
    await route.fulfill({ json: {
      from, to: from + 8, signature: "function positive(readings: number[]): number[]",
      documentation: "Keep **positive** readings. The input stays unchanged.",
      tags: [
        { name: "example", text: "positive([3, -1]);" },
        { name: "param", text: "readings - A list of measurements." },
        { name: "see", text: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter" },
      ],
    } });
  });
  await page.goto("/iframe.html?id=components-editor--playground&viewMode=story&args=documentationUrl:uix-hover");
  const declaration = page.locator(".view-lines .view-line").filter({ hasText: "export function positive" });
  await declaration.getByText("positive", { exact: true }).hover();
  const hover = page.getByRole("tooltip").filter({ hasText: "The input stays unchanged." });
  await expect(hover).toContainText("The input stays unchanged.");
  await expect(hover.locator(".monaco-tokenized-source").last()).toContainText("positive");
  const [reference] = await Promise.all([
    page.waitForEvent("popup"),
    hover.getByRole("link").click(),
  ]);
  await expect(reference).toHaveURL(/developer.mozilla.org/);
  await reference.close();
  expect(requested).toBe(true);
});

test("button corners match the calibrated round fallback", async ({ page }) => {
  await page.goto("/iframe.html?id=components-button--default&viewMode=story");
  const button = page.getByRole("button", { name: "Continue", exact: true });
  await expect(button).toBeVisible();
  const radius = () => button.evaluate(element => parseFloat(getComputedStyle(element).borderTopLeftRadius));
  const native = await radius();
  const supported = await page.evaluate(() => CSS.supports("corner-shape", "squircle"));
  await page.addStyleTag({ content: ":root, .light, .dark { --squircle-factor: 1 !important; } .ui-btn { corner-shape: round !important; }" });
  const fallback = await radius();
  expect(fallback).toBe(8);
  if (supported) expect(native * (1 - 0.5 ** 0.25)).toBeCloseTo(fallback * (1 - Math.SQRT1_2), 4);
});

test("an authoring course link opens that course's own manifest", async ({ page }) => {
  await page.goto("/iframe.html?id=pages-dojo--course-authoring&viewMode=story&args=initialCourse:Advanced%20TypeScript");
  await expect(page.getByRole("button", { name: "Close advanced/dojo.yaml", exact: true })).toBeVisible();
  await expect(page.locator(".view-lines")).toContainText("Advanced TypeScript");
});

for (const theme of ["dark", "light"]) {
  for (const mode of ["learner-kata", "course-authoring"]) {
    test(`sidebar hover and selection share corners in ${mode}, ${theme}`, async ({ page }) => {
      await page.goto(`/iframe.html?id=pages-dojo--${mode}&viewMode=story&globals=theme:${theme}`);
      const current = page.getByRole("button", { name: mode === "learner-kata" ? /^Objects \(/ : "Authoring", exact: true });
      const next = page.getByRole("button", { name: mode === "learner-kata" ? /^Arrays \(/ : "Evaluation", exact: true });
      const check = async (row: typeof current) => {
        await row.hover();
        await expect.poll(() => row.evaluate(element => {
          const layer = element.querySelector(".ui-as-side__lit");
          if (!layer) return false;
          const hover = getComputedStyle(element), selected = getComputedStyle(layer);
          return hover.borderRadius === selected.borderRadius
            && hover.getPropertyValue("corner-shape") === selected.getPropertyValue("corner-shape");
        })).toBe(true);
      };
      await check(current);
      await next.click();
      await check(next);
      await page.addStyleTag({ content: ":root, .light, .dark { --squircle-factor: 1 !important; } *, ::before, ::after { corner-shape: round !important; }" });
      await check(next);
    });
  }

  test(`course surface and its shadow use the same corners in ${theme}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=pages-dojo--learner-kata&viewMode=story&globals=theme:${theme}`);
    await expect(page.getByRole("region", { name: "Course editor", exact: true })).toBeVisible();
    const corners = await page.evaluate(() => {
      const frame = getComputedStyle(document.querySelector(".ui-as-main")!);
      const edge = getComputedStyle(document.querySelector(".ui-as-chat")!, "::after");
      return { supported: CSS.supports("corner-shape", "squircle"),
        frameShape: frame.getPropertyValue("corner-shape"), edgeShape: edge.getPropertyValue("corner-shape"),
        frameRadius: frame.borderRadius, edgeRadius: edge.borderRadius };
    });
    expect(corners.edgeShape).toBe(corners.frameShape);
    expect(corners.edgeRadius).toBe(corners.frameRadius);
    if (corners.supported) expect(corners.frameShape).toMatch(/^(squircle|superellipse\(2\))$/);
  });

  test(`install-help corners follow the padded tray in ${theme}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=pages-dojo--installation-setup&viewMode=story&globals=theme:${theme}`);
    await expect(page.getByRole("region", { name: "How to install an agent" })).toBeVisible();
    const read = () => page.evaluate(() => {
      const tray = getComputedStyle(document.querySelector(".ui-ob-card")!);
      const step = getComputedStyle(document.querySelector(".ui-ob-step")!);
      const help = getComputedStyle(document.querySelector(".ui-setup__install")!);
      return { outer: parseFloat(tray.borderBottomLeftRadius), padding: parseFloat(tray.paddingLeft),
        inner: parseFloat(help.borderBottomLeftRadius), step: parseFloat(step.borderTopLeftRadius),
        shape: help.getPropertyValue("corner-shape"), outerShape: tray.getPropertyValue("corner-shape") };
    });
    const check = (corners: Awaited<ReturnType<typeof read>>) => {
      expect(corners.outer).toBeCloseTo(corners.inner + corners.padding, 3);
      expect(corners.inner).toBe(corners.step);
      expect(corners.shape).toBe(corners.outerShape);
    };
    check(await read());
    await page.addStyleTag({ content: ":root, .light, .dark { --squircle-factor: 1 !important; } *, ::before, ::after { corner-shape: round !important; }" });
    check(await read());
  });
}
