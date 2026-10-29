import { expect, test } from "@playwright/test";

test("interactive questions save answers and only Next advances through the existing progression route", async ({ page }) => {
  test.setTimeout(30_000);
  let step = 0;
  let response: { answer: string; correct: boolean } | null = null;
  const progressions: string[] = [];
  const steps = [
    { id: "read", type: "present", title: "Read this", content: "One useful concept.", contentBase: null },
    { id: "recall", type: "question", title: "Recall it", prompt: "Which concept?", promptBase: null, answers: ["one"], explanation: "One useful concept.", explanationBase: null },
  ];
  const snapshot = () => ({ dojo: "starter", title: "Starter", lessonTitle: "Introduction", step, totalSteps: steps.length, current: steps[step] ?? null, response, complete: step === steps.length });
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/conversation")) return route.fulfill({ json: { sessionId: null, messages: [], harness: "codex", harnesses: ["codex"], model: null } });
    if (path.endsWith("/progressions")) {
      progressions.push(path);
      step++;
      response = null;
      return route.fulfill({ json: snapshot() });
    }
    if (path.endsWith("/answer")) {
      response = { answer: route.request().postDataJSON().answer, correct: true };
      return route.fulfill({ json: snapshot() });
    }
    if (path.endsWith("/interactive")) return route.fulfill({ json: snapshot() });
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [{ type: "html", html: `<p>${route.request().postDataJSON().source}</p>` }] } });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/interactive?workspace=workspace&course=starter");
  const material = page.getByTestId("interactive-material");
  const next = material.getByRole("button", { name: "Next", exact: true });
  await expect(next).toBeEnabled({ timeout: 4000 });
  expect(progressions).toEqual([]);
  await next.click();
  await expect(material.getByRole("textbox", { name: "Your answer", exact: true })).toBeVisible();
  await expect(next).toBeDisabled();
  await material.getByRole("textbox", { name: "Your answer", exact: true }).fill("one");
  await material.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(material.getByRole("status").filter({ hasText: "Correct: one" })).toBeVisible();
  expect(progressions).toHaveLength(1);
  await page.reload();
  await expect(material.getByRole("status").filter({ hasText: "Correct: one" })).toBeVisible();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(material).toContainText("Your progress was saved");
  expect(progressions).toEqual([
    "/api/workspaces/workspace/courses/starter/lessons/read/progressions",
    "/api/workspaces/workspace/courses/starter/lessons/recall/progressions",
  ]);
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toHaveCount(0);
});
