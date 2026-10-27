import { expect, test } from "@playwright/test";

test("queued authoring notes stay readable and can be removed with the shared controls", async ({ page }) => {
  const release = Promise.withResolvers<void>();
  const requests: string[] = [];
  const long = "Use plain language and keep each example focused. ".repeat(8).trim();
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: { root: "/tmp/queue-course", style: "katas", name: "Queue course", description: "One outcome", language: "TypeScript",
      manifestSource: "name: Queue course\n", courseGuidance: "", rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: "name: Queue course\n" }], lessons: [], issues: [], courseChecks: [] } });
    if (path.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" }, messages: [] } });
    if (path.endsWith("/sessions/saved/messages")) {
      requests.push(path);
      await release.promise;
      return route.fulfill({ contentType: "text/event-stream", body: "" });
    }
    return route.fulfill({ status: 404 });
  });
  try {
    await page.goto("/authoring?session=saved");
    const input = page.getByTestId("authoring-chat-composer").getByRole("textbox");
    for (const text of ["Outline the first lesson", long, "Discard this note"]) {
      await input.fill(text);
      await input.press("Enter");
    }
    const queue = page.getByRole("region", { name: "Queued messages", exact: true });
    await expect(queue).toContainText("2 queued");
    const note = queue.getByText(long, { exact: true });
    await expect(note).toHaveCSS("white-space", "pre-wrap");
    expect(await note.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(queue.getByRole("button").first()).toHaveClass(/ui-button/);
    await page.screenshot({ path: test.info().outputPath("authoring-queue-desktop.png"), animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Show chat", exact: true }).click();
    await expect(queue).toBeVisible();
    expect(await note.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("authoring-queue-phone.png"), animations: "disabled" });
    const remove = queue.getByRole("button", { name: 'Remove "Discard this note" from the queue', exact: true });
    await remove.focus();
    await remove.press("Enter");
    await expect(queue).toContainText("1 queued");
    await expect(note).toBeVisible();
    await queue.getByRole("button").click();
    await expect(queue).toHaveCount(0);
    expect(requests).toEqual(["/api/authoring/eve/sessions/saved/messages"]);
  } finally { release.resolve(); }
});
