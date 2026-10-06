import { expect, test } from "@playwright/test";

test("the outer chain grows with expanded steps; only reasoning bodies scroll", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-activity--expandable-chain&viewMode=story");
  await page.getByRole("button", { name: "Worked", exact: true }).click();
  const chain = page.getByRole("region", { name: "Activity details", exact: true });
  await expect(chain).toHaveCSS("max-height", "none");
  await expect(chain).toHaveCSS("overflow-y", "visible");
  const before = await chain.boundingBox();
  await chain.getByRole("button", { name: "Reasoning", exact: true }).first().click();
  const body = page.getByRole("region", { name: "Reasoning step details" });
  await expect(body).toBeVisible();
  expect(await body.evaluate(node => node.clientHeight)).toBeLessThanOrEqual(192);
  expect(await body.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await expect.poll(async () => (await chain.boundingBox())!.height).toBeGreaterThan(before!.height + 150);
  await body.focus();
  await page.keyboard.press("PageDown");
  await expect.poll(() => body.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await expect(chain.getByRole("button", { name: /read_file/ })).toHaveAttribute("aria-expanded", "false");
});

test("reasoning morphs through five labels and colors without restarting its row", async ({ page }) => {
  await page.clock.install();
  await page.goto("/iframe.html?id=chat-activity--dynamic-indicator&viewMode=story");
  const indicator = page.locator('[data-slot="thinking-indicator"]');
  await expect(indicator).toHaveAttribute("data-activity-label", "Thinking");
  const original = await indicator.elementHandle();
  const colors = new Set<string>();
  for (const label of ["Rethinking", "Connecting brain cells", "Untangling noodles", "Polishing a hunch", "Thinking"]) {
    await page.clock.runFor(4000);
    await expect(indicator).toHaveAttribute("data-activity-label", label);
    await page.clock.runFor(200);
    const frame = indicator.locator('[data-text-morph]');
    await expect(frame).toHaveCSS("mask-image", "none");
    await expect(frame).toHaveCSS("overflow", "visible");
    await expect(frame.getByText(label, { exact: true })).toHaveCSS("transform", "none");
    await expect(frame.getByText(label, { exact: true }).locator("span")).toHaveCount(0);
    colors.add(await indicator.locator("[data-thinking-dot]").getAttribute("class") ?? "");
    expect(await indicator.evaluate((node, first) => node === first, original)).toBe(true);
    await expect(indicator).toHaveAccessibleName("");
  }
  expect(colors.size).toBe(5);
});

test("reduced motion keeps reasoning copy stable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.goto("/iframe.html?id=chat-activity--dynamic-indicator&viewMode=story");
  const indicator = page.locator('[data-slot="thinking-indicator"]');
  await expect(indicator).toHaveAttribute("data-activity-label", "Thinking");
  await page.clock.runFor(9000);
  await expect(indicator).toHaveAttribute("data-activity-label", "Thinking");
  await expect(indicator.locator("[data-thinking-dot]")).toHaveCSS("animation-name", "none");
});

test("a real-time blur fade removes the outgoing whole label", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-activity--dynamic-indicator&viewMode=story");
  const indicator = page.locator('[data-slot="thinking-indicator"]');
  await expect(indicator).toHaveAttribute("data-activity-label", "Rethinking", { timeout: 7000 });
  const frame = indicator.locator("[data-text-morph]");
  await expect(frame.locator(":scope > span")).toHaveCount(1);
  await expect(frame).toHaveText("Rethinking");
  await expect(frame.locator(":scope > span")).toHaveCSS("transform", "none");
});

test("active tools use stable purpose labels rather than reasoning jokes", async ({ page }) => {
  await page.clock.install();
  await page.goto("/iframe.html?id=chat-activity--tool-activity-labels&viewMode=story");
  for (const label of ["Working", "Teaching sensei", "Preparing lesson", "Testing", "Waiting"]) {
    await expect(page.locator(`[data-activity-label="${label}"]`)).toBeVisible();
  }
  await page.clock.runFor(9000);
  await expect(page.locator('[data-activity="thinking"]')).toHaveCount(0);
  await expect(page.locator('[data-activity-label="Teaching sensei"]')).toBeVisible();
});

test("expanded tool output aligns with its header and uses Shiki highlighting", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-activity--tool-outputs&viewMode=story");
  const header = page.getByRole("button", { name: /inspect_result/ });
  const output = page.locator('[data-language="json"]');
  await expect(output).toBeVisible();
  await expect.poll(() => output.locator('span[style*="--shiki-dark"]').count()).toBeGreaterThan(0);
  const headerBounds = await header.boundingBox();
  expect((await output.boundingBox())?.x).toBe(headerBounds?.x);
  await expect(output.locator("pre")).toHaveCSS("padding-left", "0px");
  await expect(output).toContainText('"passed": 3');
  await expect(output).toContainText("<script>not executable</script>");
  await expect(output.locator("script")).toHaveCount(0);
  const region = page.locator(`[id="${await header.getAttribute("aria-controls")}"]`);
  await expect(region.locator(":scope > div")).toHaveCSS("border-top-style", "dashed");
  const typescript = page.locator('[data-language="typescript"]');
  await expect.poll(() => typescript.locator('span[style*="--shiki-dark"]').count()).toBeGreaterThan(0);
  await expect(page.locator('[data-language="text"]')).toHaveText("Lesson instructions loaded");
});

test("long reasoning scrolls in a compact panel without moving its header", async ({ page }) => {
  for (const width of [640, 320]) {
    await page.setViewportSize({ width, height: 600 });
    await page.goto("/iframe.html?id=chat-activity--long-reasoning&viewMode=story");
    const header = page.getByRole("button", { name: "Thought for 13s" });
    await header.click();
    const panel = page.getByRole("region", { name: "Reasoning details" });
    await expect(panel).toBeVisible();
    await expect(panel).toHaveCSS("border-top-style", "dashed");
    expect((await panel.locator("li span").first().boundingBox())?.x).toBe((await header.boundingBox())?.x);
    const dimensions = await panel.evaluate(node => ({ height: node.clientHeight, content: node.scrollHeight, width: node.clientWidth, scrollWidth: node.scrollWidth }));
    expect(dimensions.height).toBeLessThanOrEqual(192);
    expect(dimensions.content).toBeGreaterThan(dimensions.height);
    expect(dimensions.scrollWidth).toBe(dimensions.width);
    await expect(panel).toHaveCSS("overscroll-behavior-y", "contain");
    const headerPosition = await header.boundingBox();
    await panel.focus();
    await page.keyboard.press("PageDown");
    await expect.poll(() => panel.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    expect(await header.boundingBox()).toEqual(headerPosition);
    await header.click();
    await expect(panel).toBeHidden();
  }
});

test("one timed chain contains independently collapsed reasoning and tool steps", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-streaming-cassettes--chained-tools-without-response&viewMode=story");
  const indicator = page.locator('[data-slot="thinking-indicator"]');
  await expect(indicator).toHaveAttribute("data-activity", "thinking");
  const original = await indicator.elementHandle();
  await expect(indicator).toHaveAttribute("data-activity-label", "Working");
  expect(await indicator.evaluate((node, first) => node === first, original)).toBe(true);
  const thought = page.getByRole("button", { name: /^Worked for/ });
  await expect(thought).toBeVisible({ timeout: 20_000 });
  expect(await indicator.evaluate((node, first) => node === first, original)).toBe(true);
  const duration = await indicator.getAttribute("data-activity-label");
  expect(Number(duration?.match(/\d+/)?.[0])).toBeGreaterThan(5);
  const visibleLabel = indicator.locator('[data-text-morph]');
  await expect(visibleLabel).toHaveText(duration!);
  await expect(visibleLabel).toHaveCSS("mask-image", "none");
  expect(await visibleLabel.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await expect(page.getByRole("button", { name: /^Worked/ })).toHaveCount(1);
  await expect(thought).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('[data-tool-call="read_file"]')).toBeHidden();
  await thought.click();
  const details = page.getByRole("region", { name: "Activity details" });
  await expect(details.locator('button[aria-expanded="false"]')).toHaveCount(4);
  await expect(details.locator('[data-tool-call="read_file"]')).toBeVisible();
  await expect(details.locator('[data-tool-call="search_files"]')).toBeVisible();
  await expect(details.locator('[data-tool-call="run_command"]')).toBeVisible();
  const reasoning = details.getByRole("button", { name: "Reasoning", exact: true });
  await expect(reasoning.locator("[data-tool-status]")).toHaveCount(0);
  await expect(page.getByText("Locate the implementation before checking it.", { exact: false })).toBeHidden();
  await reasoning.click();
  await expect(page.getByText("Locate the implementation before checking it.", { exact: false })).toBeVisible();
  await expect(details.getByRole("button", { name: /read_file/ })).toHaveAttribute("aria-expanded", "false");
  await details.getByRole("button", { name: /read_file/ }).click();
  await expect(details.locator('[data-tool-call="read_file"] [data-language="json"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /^Worked/ })).toHaveCount(1);
});

test("free-text retains the same completed timer without reasoning chunks", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-streaming-cassettes--free-text-question&viewMode=story");
  const waiting = page.getByRole("button", { name: "Thinking", exact: true });
  await expect(waiting).toBeVisible();
  const original = await waiting.elementHandle();
  const completed = page.getByRole("button", { name: /^Thought for (?:<1|\d+)s$/ });
  await expect(completed).toBeVisible();
  expect(await completed.evaluate((node, first) => node === first, original)).toBe(true);
  await expect(completed).toBeDisabled();
  await expect(completed.locator("svg")).toBeHidden();
  await expect(completed.locator('[data-thinking-dot="complete"]')).toHaveCount(1);
  await expect(page.getByText("Before we continue, describe what still feels uncertain.", { exact: true })).toBeVisible();
  const label = await completed.textContent();
  await page.waitForTimeout(1200);
  await expect(completed).toHaveText(label!);
});

test("tool hover reaches both chat edges while tool and thinking icons align", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-streaming-cassettes--chained-tools-without-response&viewMode=story");
  const chain = page.locator('[data-slot="thinking-indicator"]').locator("..");
  await expect(chain).toBeEnabled();
  await chain.click();
  const row = page.locator('[data-tool-call="read_file"] [data-tool-header]').first();
  await expect(row).toBeVisible();
  const viewport = page.locator('[data-slot="scroll-area-viewport"]').first();
  const bounds = await viewport.boundingBox();
  const tool = await row.boundingBox();
  expect(tool?.x).toBe(bounds?.x);
  expect(tool?.width).toBe(bounds?.width);
  await expect(row).toHaveCSS("padding-left", "16px");
  await expect(row).toHaveCSS("padding-right", "16px");
  const dotColumn = await page.locator("[data-thinking-dot]").first().evaluate(dot => dot.parentElement!.getBoundingClientRect().x);
  const toolColumn = await row.evaluate(button => {
    const dot = button.querySelector("[data-thinking-dot]");
    const icon = dot?.parentElement ?? button.querySelector(":scope > span");
    return icon!.getBoundingClientRect().x;
  });
  expect(dotColumn).toBe(toolColumn);
  const reachesEdge = await row.evaluate(button => {
    const rect = button.getBoundingClientRect();
    return [rect.left + 1, rect.right - 1].every(x => button.contains(document.elementFromPoint(x, rect.top + rect.height / 2)));
  });
  expect(reachesEdge).toBe(true);
  expect(await viewport.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
});

test("tool rows fill their column and flash without scaling on press", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-activity--direct-question&viewMode=story");
  const row = page.getByRole("button", { name: /read_file/ });
  await expect(row).toBeVisible();
  const box = await row.boundingBox();
  const next = await page.getByRole("button", { name: /lesson_checks/ }).boundingBox();
  expect(next?.y).toBe((box?.y ?? 0) + (box?.height ?? 0));
  const column = await row.evaluate(node => node.parentElement!.parentElement!.getBoundingClientRect().width);
  expect(box?.width).toBe(column);
  await expect(row).toHaveCSS("padding-left", "0px");
  await row.hover();
  const hover = await row.evaluate(node => getComputedStyle(node).backgroundColor);
  await page.mouse.down();
  await expect(row).toHaveCSS("transform", "none");
  await expect(row).toHaveCSS("scale", "none");
  await expect.poll(() => row.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe(hover);
  expect(await row.boundingBox()).toEqual(box);
  await page.mouse.up();
  await expect(row).toHaveAttribute("aria-expanded", "true");
});

test("free-text story uses compact sizing for the assistant prose", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-streaming-cassettes--free-text-question&viewMode=story");
  const prose = page.getByText("Before we continue, describe what still feels uncertain.", { exact: true });
  await expect(prose).toBeVisible();
  await expect(prose).toHaveCSS("font-size", "14px");
  await expect(prose).toHaveCSS("line-height", "24px");
});

test("the waiting row stays mounted and fixed when reasoning arrives", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-streaming-cassettes--multiple-choice&viewMode=story");
  const row = page.getByRole("button", { name: "Thinking", exact: true });
  await expect(row).toBeVisible();
  await expect(row).toBeDisabled();
  const original = await row.elementHandle();
  const box = await row.boundingBox();
  await expect(row).toBeEnabled();
  expect(await row.evaluate((node, first) => node === first, original)).toBe(true);
  expect(await row.boundingBox()).toEqual(box);
  const completed = page.getByRole("button", { name: /^(Thought|Worked)/ });
  await expect(completed).toBeVisible();
  expect(await completed.evaluate((node, first) => node === first, original)).toBe(true);
  const after = await completed.boundingBox();
  expect(after?.x).toBe(box?.x);
  expect(after?.y).toBe(box?.y);
  expect(after?.height).toBe(box?.height);
});

test("multiple choice uses the same dot for waiting, reasoning and completed thought", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-streaming-cassettes--multiple-choice&viewMode=story");
  await expect(page.locator('[data-thinking-dot="active"]')).toHaveCount(1);
  const reasoning = page.getByRole("button", { name: "Thinking", exact: true });
  await expect(reasoning).toBeVisible();
  await expect(reasoning.locator('[data-thinking-dot="active"]')).toHaveCount(1);
  await expect(page.getByTestId("waiting-for-output")).toHaveCount(0);
  const completed = page.getByRole("button", { name: /^(Thought|Worked)/ });
  await expect(completed).toBeVisible();
  await expect(completed.locator('[data-thinking-dot="complete"]')).toHaveCount(1);
  await expect(page.locator('[data-thinking-dot="active"]')).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /^Review/ })).toBeVisible();
});

test("edit approval shows the diff and locks the decision without badge circles", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-activity--editing-approval&viewMode=story");
  await expect(page.getByText("Start with a concrete example.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Allow/ }).click();
  await expect(page.getByText("Allowed once", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Deny/ })).toBeDisabled();
  const edit = page.getByRole("button", { name: /edit_file/ });
  await expect(edit).toHaveAttribute("aria-expanded", "false");
  const badge = page.locator("[data-tool-status]");
  await expect(badge.locator("svg")).toHaveCount(1);
  expect(await badge.evaluate(node => getComputedStyle(node).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await edit.click();
  await expect(page.getByText("Start with a concrete example.", { exact: true })).toHaveCount(2);
});

test("cassette drops obsolete selectors and does not restart waiting after reasoning", async ({ page }) => {
  await page.addInitScript(() => {
    const observed = { duplicate: false };
    Object.assign(window, { activityObservation: observed });
    new MutationObserver(() => {
      const reasoning = [...document.querySelectorAll("button")].some(button => /^(Thinking|Thought)(\s|$)/.test(button.textContent?.trim() ?? ""));
      if (reasoning && document.querySelector('[data-testid="waiting-for-output"]')) observed.duplicate = true;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.goto("/iframe.html?id=chat-streaming-cassettes--thought-indicator&viewMode=story");
  await expect(page.getByText("What input would help verify tabs behave the same way?", { exact: false })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Active course", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByTestId("waiting-for-output")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { activityObservation: { duplicate: boolean } }).activityObservation.duplicate)).toBe(false);
});

test("direct question preview removes badge surfaces and shows an answerable form", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-activity--direct-question&viewMode=story");
  await expect(page.getByRole("button", { name: /read_file/ })).toBeVisible();
  await expect(page.locator(".rounded-full.bg-white")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /elicitation/ })).toHaveCount(0);
  await page.getByRole("radio", { name: /^Review/ }).click();
  await expect(page.getByRole("status")).toHaveText("Selected: review");
  await expect(page.getByRole("radio", { name: /^Move on/ })).toBeDisabled();
});

test("activity follows supplied chunks, stays collapsed, and preserves new reasoning", async ({ page }) => {
  await page.goto("/iframe.html?id=chat-activity--streaming&viewMode=story");
  const thinking = page.getByRole("button", { name: "Thinking", exact: true });
  await expect(thinking).toHaveAttribute("aria-expanded", "false");
  const tool = page.getByRole("button", { name: /read_file/ });
  await expect(tool).toHaveCount(0);
  await thinking.click();
  await expect(page.getByText("Inspecting the course", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next chunk" }).click();
  await expect(page.getByText("Checking the lesson files", { exact: true })).toBeVisible();
  await expect(thinking).toBeVisible();
  await page.getByRole("button", { name: "Next chunk" }).click();
  await expect(thinking).toHaveCount(0);
  await expect(tool).toHaveAttribute("aria-expanded", "false");
  await tool.click();
  await expect(page.getByText("Lesson instructions loaded", { exact: true })).toBeVisible();
  await tool.click();
  await expect(tool).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: /failed_read/ }).click();
  await expect(page.getByText("File not found", { exact: true })).toBeVisible();
});
