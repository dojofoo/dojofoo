import { expect, test } from "@playwright/test";

test("browses compact courses from reusable marketplace navigation", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Build an LLM/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Effect TS/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Pydantic Agents/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Python" })).toBeVisible();
  await expect(page.getByRole("button", { name: "TypeScript" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search courses" })).toBeVisible();
  await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get Dojocho" })).toBeVisible();

  const effectCard = page.getByTestId("course-effect-ts");
  await expect(effectCard.getByText("v0.0.4")).toBeVisible();
  await expect(effectCard.getByText("dojocho", { exact: true })).toHaveCount(0);
  await expect(effectCard.getByText("TypeScript", { exact: true })).toHaveCount(0);
  await expect(effectCard.getByRole("img", { name: "Weekly starts and completions" })).toBeVisible();
  await expect(effectCard.getByRole("button", { name: "Copy to clipboard" })).toBeVisible();

  await page.keyboard.press("Control+K");
  const search = page.getByRole("searchbox", { name: "Search courses" });
  await search.fill("pydantic");
  await expect(page.getByRole("link", { name: /Pydantic Agents/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Effect TS/i })).toHaveCount(0);
  await search.fill("");

  await page.getByRole("link", { name: /Effect TS/i }).click();
  await expect(page.getByRole("heading", { name: "Effect TS" })).toBeVisible();
  await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get Dojocho" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Starts versus finishes" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Weekly starts and completions" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("reflects install, progress, and completion events", async ({ page, request }) => {
  const instanceId = "playwright-completed-course";
  for (const event of [
    { event: "installed" },
    { event: "started", kata: "001-hello-effect" },
    { event: "kata_completed", kata: "001-hello-effect" },
    { event: "finished", kata: "040-request-batching" },
  ]) {
    const response = await request.post("http://127.0.0.1:4311/api/v1/events", {
      data: { instanceId, courseId: "dojocho/effect-ts", ...event },
    });
    expect(response.status()).toBe(202);
  }

  await page.goto("/courses/dojocho/effect-ts");
  await expect(page.getByRole("paragraph").filter({ hasText: "1 finished" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Starts versus finishes" })).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
});
