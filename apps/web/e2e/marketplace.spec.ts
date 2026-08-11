import { expect, test } from "@playwright/test";

test("browses courses and inspects progress without leaving the marketplace", async ({ page }) => {
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

  const effectCard = page.getByTestId("course-effect-ts");
  await expect(effectCard.getByText("Installs")).toBeVisible();
  await expect(effectCard.getByText("Progressing")).toBeVisible();
  await expect(effectCard.getByText("Finished", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /Effect TS/i }).click();
  await expect(page.getByRole("heading", { name: "Effect TS" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Starts versus finishes" })).toBeVisible();
  await expect(page.getByText("Where senpais get stuck")).toBeVisible();
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
