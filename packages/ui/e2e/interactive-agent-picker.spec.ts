import { expect, test } from "@playwright/test";

test("interactive agent selection preserves the question and restores the selected agent's conversation", async ({ page }) => {
  const models = { id: "model", name: "Model", currentValue: "deepseek/model", options: [
    { value: "deepseek/model", name: "DeepSeek", group: "DeepSeek" }, { value: "openai/model", name: "GPT", group: "OpenAI" },
  ] };
  const saved = {
    opencode: { sessionId: "opencode-owned", harness: "opencode", harnesses: ["opencode", "codex"], model: models,
      messages: [{ id: "old", role: "assistant", parts: [{ type: "text", content: "Your saved OpenCode conversation" }] }] },
    codex: { sessionId: "codex-owned", harness: "codex", harnesses: ["opencode", "codex"], model: { ...models, currentValue: "openai/model", options: [models.options[1]] },
      messages: [{ id: "other", role: "assistant", parts: [{ type: "text", content: "Your saved Codex conversation" }] }] },
  };
  let selected: keyof typeof saved = "opencode";
  let attempts = 0;
  const writes: string[] = [];
  await page.route("**/api/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") writes.push(path);
    if (path.endsWith("/configuration/harness")) {
      attempts += 1;
      if (attempts === 1) return route.fulfill({ status: 502, json: { error: "Codex needs login" } });
      selected = request.postDataJSON().harness;
      return route.fulfill({ json: saved[selected] });
    }
    if (path.endsWith("/configuration/model")) {
      saved[selected].model = { ...saved[selected].model, currentValue: request.postDataJSON().value };
      return route.fulfill({ json: saved[selected].model });
    }
    if (path.endsWith("/conversation")) return route.fulfill({ json: saved[selected] });
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [{ type: "html", html: "<p>Read and think.</p>" }] } });
    if (path.endsWith("/interactive")) return route.fulfill({ json: {
      dojo: "interactive", title: "Interactive course", lessonTitle: "First lesson", step: 0, totalSteps: 2, complete: false, response: null,
      current: { id: "first", type: "present", title: "First step", content: "Read and think.", contentBase: null },
    } });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/interactive?workspace=agent-workspace&course=interactive");
  const agent = page.getByRole("button", { name: "Agent", exact: true });
  const model = page.getByRole("button", { name: "Model", exact: true });
  const draft = page.getByRole("textbox", { name: "Message the sensei", exact: true });
  await expect(agent).toContainText("OpenCode");
  await draft.fill("Keep my course question");
  await model.click();
  await page.getByRole("menuitemradio", { name: /^GPT/ }).click();
  const choose = async (name: string) => {
    await agent.click();
    await expect(page.getByRole("menuitemradio", { name: /^Pi/ })).toHaveCount(0);
    await page.getByRole("menuitemradio", { name: new RegExp(`^${name}`) }).click();
  };
  await choose("Codex");
  await expect(page.getByRole("alert").filter({ hasText: "Codex needs login" })).toBeVisible();
  await expect(page.getByTestId("chat-pane")).toContainText("Your saved OpenCode conversation");
  await expect(agent).toContainText("OpenCode");
  await choose("Codex");
  await expect(agent).toContainText("Codex");
  await expect(page.getByTestId("chat-pane")).toContainText("Your saved Codex conversation");
  await choose("OpenCode");
  await expect(agent).toContainText("OpenCode");
  await expect(model).toContainText("GPT");
  await expect(draft).toHaveValue("Keep my course question");
  await expect(page.getByTestId("chat-pane")).toContainText("Your saved OpenCode conversation");
  expect(writes.some(path => /\/(?:messages|answer|advance)$/.test(path))).toBe(false);
  await page.reload();
  await expect(agent).toContainText("OpenCode");
  await expect(model).toContainText("GPT");
  await expect(page.getByRole("heading", { name: "First step", exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("interactive-agent-picker.png"), animations: "disabled" });
});

test("an unused agent can be prepared again without submitting the typed question", async ({ page }) => {
  const operations: string[] = [];
  await page.route("**/api/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") operations.push(path);
    if (path.endsWith("/conversation")) return route.fulfill({ json: { sessionId: null, harness: "codex", harnesses: ["codex"], model: null, messages: [] } });
    if (path.endsWith("/configuration/harness")) return route.fulfill({ json: { sessionId: "prepared", harness: "codex", harnesses: ["codex"], messages: [],
      model: { id: "model", name: "Model", currentValue: "gpt", options: [{ value: "gpt", name: "GPT" }] } } });
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/interactive")) return route.fulfill({ json: { dojo: "empty", title: "Empty selection", lessonTitle: "First lesson", step: 0, totalSteps: 1,
      complete: false, response: null, current: { id: "first", type: "present", title: "First step", content: "Read.", contentBase: null } } });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/interactive?workspace=agent-workspace&course=empty");
  const agent = page.getByRole("button", { name: "Agent", exact: true });
  const model = page.getByRole("button", { name: "Model", exact: true });
  await expect(agent).toContainText("Codex");
  await expect(model).toBeDisabled();
  const question = page.getByRole("textbox", { name: "Message the sensei", exact: true });
  await question.fill("I will send this myself");
  await agent.click();
  await page.getByRole("menuitemradio", { name: /^Codex/ }).click();
  await expect(model).toBeEnabled();
  await expect(model).toContainText("GPT");
  await expect(question).toHaveValue("I will send this myself");
  expect(operations.filter(path => path !== "/api/teaching/preview")).toEqual(["/api/workspaces/agent-workspace/courses/empty/interactive/configuration/harness"]);
});

test("a late refresh cannot replace the selected agent's conversation", async ({ page }) => {
  let reads = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const conversation = (harness: string) => ({ sessionId: `${harness}-owned`, harness, harnesses: ["opencode", "codex"], model: null,
    messages: [{ id: harness, role: "assistant", parts: [{ type: "text", content: `${harness} history` }] }] });
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/conversation")) {
      reads += 1;
      if (reads === 2) await held;
      return route.fulfill({ json: conversation("opencode") });
    }
    if (path.endsWith("/configuration/harness")) return route.fulfill({ json: conversation("codex") });
    if (path.endsWith("/messages")) {
      const body = request.postDataJSON();
      const events = [
        { type: "RUN_STARTED", threadId: body.threadId, runId: body.runId },
        { type: "TEXT_MESSAGE_START", messageId: "reply", role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: "reply", delta: "OpenCode answered" },
        { type: "TEXT_MESSAGE_END", messageId: "reply" },
        { type: "RUN_FINISHED", threadId: body.threadId, runId: body.runId },
      ];
      return route.fulfill({ contentType: "text/event-stream", body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") });
    }
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/interactive")) return route.fulfill({ json: { dojo: "race", title: "Race course", lessonTitle: "First lesson", step: 0, totalSteps: 1,
      complete: false, response: null, current: { id: "read", type: "present", title: "Read", content: "Read.", contentBase: null } } });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/interactive?workspace=agent-workspace&course=race");
  const agent = page.getByRole("button", { name: "Agent", exact: true });
  await expect(agent).toBeEnabled();
  await page.getByRole("textbox", { name: "Message the sensei", exact: true }).fill("Explain this step");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => reads).toBe(2);
  await expect(agent).toBeEnabled();
  await agent.click();
  await page.getByRole("menuitemradio", { name: /^Codex/ }).click();
  await expect(agent).toContainText("Codex");
  const late = page.waitForResponse(response => response.request().method() === "GET" && new URL(response.url()).pathname.endsWith("/conversation"));
  release();
  await (await late).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(agent).toContainText("Codex");
  await expect(page.getByTestId("chat-pane")).toContainText("codex history");
});

test("initial conversation loading keeps the composer waiting until its supported choices arrive", async ({ page }) => {
  const ready = Promise.withResolvers<void>();
  const writes: string[] = [];
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET" && path !== "/api/teaching/preview") writes.push(path);
    if (path.endsWith("/conversation")) {
      await ready.promise;
      return route.fulfill({ json: { sessionId: "prepared", harness: "opencode", harnesses: ["opencode"],
        model: { id: "model", name: "Model", currentValue: "supported", options: [{ value: "supported", name: "Supported model" }] }, messages: [] } });
    }
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/interactive")) return route.fulfill({ json: { dojo: "loading", title: "Loading course", lessonTitle: "First lesson", step: 0, totalSteps: 1,
      complete: false, response: null, current: { id: "first", type: "present", title: "First step", content: "Read.", contentBase: null } } });
    return route.fulfill({ status: 404 });
  });
  try {
    await page.goto("/interactive?workspace=agent-workspace&course=loading");
    await expect(page.getByRole("heading", { name: "First step", exact: true })).toBeVisible();
    const chat = page.getByTestId("chat-pane");
    const agent = page.getByRole("button", { name: "Agent", exact: true });
    const model = page.getByRole("button", { name: "Model", exact: true });
    const input = page.getByRole("textbox", { name: "Message the sensei", exact: true });
    await expect(chat).toHaveAttribute("aria-busy", "true");
    await expect(chat.getByRole("status")).toContainText("Loading the coding agent session");
    await expect(agent).toBeDisabled();
    await expect(model).toBeDisabled();
    await expect(input).toBeDisabled();
    const spinner = chat.getByRole("status").locator("svg");
    await expect(spinner).toHaveCSS("width", "14px");
    await expect(spinner).toHaveCSS("height", "14px");
    await page.screenshot({ path: test.info().outputPath("interactive-session-loading.png"), animations: "disabled" });
    ready.resolve();
    await expect(chat).not.toHaveAttribute("aria-busy", "true");
    await expect(agent).toContainText("OpenCode");
    await expect(model).toContainText("Supported model");
    await expect(agent).toBeEnabled();
    await expect(model).toBeEnabled();
    await expect(input).toBeEnabled();
    expect(writes).toEqual([]);
  } finally { ready.resolve(); }
});
