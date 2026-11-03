import { expect, savedReply, test } from "./agent-chat.fixture";

test.setTimeout(60_000);

for (const mode of ["authoring", "learner"] as const) test(`${mode} paints its workspace while filesystem reads are pending`, async ({ page }, info) => {
  const files = Promise.withResolvers<void>();
  await page.routeWebSocket("**/api/**", () => {});
  await page.route("**/api/**", async route => {
    await files.promise;
    return route.fulfill({ status: 404, json: { error: "Fixture finished" } });
  });
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Learners open a session, whichever kind of course it is in
    await page.goto(mode === "authoring" ? "/authoring?session=saved" : "/session/saved-run");
    await expect(page.getByRole("region", { name: "Course editor", exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: "Loading files", exact: true })).toBeVisible();
    await expect(page.getByText("Thinking", { exact: true })).toHaveCount(0, { timeout: 2000 });
    await expect(page.getByRole("textbox")).toBeDisabled();
    await expect(page.getByText("Loading your dojo…", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`${mode}-loading-desktop.png`), animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("region", { name: "Course editor", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${mode}-loading-phone.png`), animations: "disabled" });
  } finally { files.resolve(); }
});

test("authoring opens its files before the agent connects and retains edits when it does", async ({ page, mountAgentChat }) => {
  const connected = Promise.withResolvers<void>();
  const writes: string[] = [];
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [{ type: "html", html: "<p>One outcome</p>" }] } });
    if (route.request().method() !== "GET") writes.push(path);
    if (path.endsWith("/draft")) {
      return route.fulfill({ json: { root: "/tmp/fast-files", style: "katas", name: "Fast files", description: "One outcome", language: "TypeScript",
        manifestSource: "name: Fast files\n", courseGuidance: "", rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: "name: Fast files\n" }], lessons: [], issues: [], courseChecks: [] } });
    }
    return route.fulfill({ status: 404 });
  });
  const agent = await mountAgentChat(page, { root: "/tmp/fast-files", files: false });
  await page.route("**/api/v1/**", async route => { await connected.promise; return route.fallback(); });
  try {
    await page.goto(`/authoring?session=${agent.sessionId}`);
    await expect(page.getByRole("region", { name: "Course editor", exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("tab", { name: "dojo.yaml", exact: true })).toBeVisible();
    await expect(page.getByText("Thinking", { exact: true })).toHaveCount(0);
    const input = page.getByRole("textbox", { name: "Code editor", exact: true });
    await input.focus();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("# Keep this local edit");
    connected.resolve();
    await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeEnabled();
    await expect(page.locator(".view-lines")).toContainText("Keep this local edit");
    expect(writes).toEqual([]);
  } finally { connected.resolve(); }
});

test("a direct learner URL opens its lesson before discovery and keeps the same workspace", async ({ page }) => {
  const discovery = Promise.withResolvers<void>();
  const writes: string[] = [];
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [{ type: "html", html: "<p>One outcome</p>" }] } });
    if (path.endsWith("/diagnostics")) return route.fulfill({ json: [] });
    if (path.endsWith("/completions")) return route.fulfill({ json: { from: 0, options: [] } });
    if (request.method() !== "GET") writes.push(path);
    if (path === "/api/control/learning-sessions/saved-run") return route.fulfill({ json: { id: "fast-course", title: "Fast Course", workspaceId: "fast-workspace", runId: "saved-run", mode: "katas", kata: "first", description: "", version: "", language: "TypeScript", tags: [], lessons: ["first"] } });
    if (path === "/api/control/courses") {
      await discovery.promise;
      return route.fulfill({ json: [{ workspaceId: "fast-workspace", dojo: "fast-course", kata: "first", mode: "katas", workspaceName: "Fast files", selected: true,
        sessionId: "saved", sessions: [{ lessonId: "first", sessionId: "saved" }] }] });
    }
    if (path.endsWith("/lessons/first")) {
      return route.fulfill({ json: { dojo: "fast-course", kata: "first", title: "First lesson", briefing: "One outcome", code: "export const answer = 0;\n", starterCode: "export const answer = 0;\n",
        fileId: "solution", filePath: "first.ts", language: "typescript", introduced: true, checkpointed: false, sessionId: "saved", harness: "codex", harnesses: ["codex"], model: null,
        state: "ongoing", isCurrent: true, result: null, fragments: {}, messages: [{ id: "saved-guidance", role: "assistant", parts: [{ type: "text", content: "Your saved guidance" }] }],
        lessons: [{ name: "first", title: "First lesson", summary: "One outcome", state: "ongoing", isCurrent: true }] } });
    }
    return route.fulfill({ status: 404 });
  });
  try {
    await page.goto("/session/saved-run");
    await expect(page.getByRole("region", { name: "Course editor", exact: true })).toBeVisible({ timeout: 5000 });
    const input = page.getByRole("textbox", { name: "Code editor", exact: true });
    await input.focus();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("// Keep this local edit");
    const question = page.getByTestId("chat-composer").getByRole("textbox");
    await question.fill("Keep this unsent question");
    discovery.resolve();
    await expect(page.getByTestId("chat-composer")).toBeVisible();
    await expect(page.locator(".view-lines")).toContainText("Keep this local edit");
    await expect(question).toHaveValue("Keep this unsent question");
    expect(writes).toEqual([]);
  } finally { discovery.resolve(); }
});


test("saved authoring guidance opens before course files", async ({ page, mountAgentChat }) => {
  const files = Promise.withResolvers<void>();
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/draft")) { await files.promise; return route.fulfill({ json: {
      root: "/tmp/fast-files", style: "katas", name: "Fast files", description: "One outcome", language: "TypeScript",
      rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: "name: Fast files\n" }], lessons: [], issues: [], courseChecks: [],
    } }); }
    return route.fulfill({ status: 404 });
  });
  const agent = await mountAgentChat(page, { root: "/tmp/fast-files", files: false });
  try {
    await page.goto(`/authoring?workspace=ws-1&session=${agent.sessionId}`);
    await expect(page.getByText(savedReply, { exact: true })).toBeVisible({ timeout: 5000 });
    const question = page.getByTestId("authoring-chat-composer").getByRole("textbox");
    await question.fill("Keep my question while files open");
    files.resolve();
    await expect(page.getByRole("tab", { name: "dojo.yaml", exact: true })).toBeVisible();
    await expect(question).toHaveValue("Keep my question while files open");
    await expect(page.getByText(savedReply, { exact: true })).toBeVisible();
  } finally { files.resolve(); }
});

test("learner files remain editable through a failed agent resume and retry", async ({ page }) => {
  const agent = Promise.withResolvers<void>();
  let retry = false;
  const lesson = { dojo: "fast-course", kata: "first", title: "First lesson", briefing: "One outcome", code: "export const answer = 0;\n", starterCode: "export const answer = 0;\n",
    fileId: "solution", filePath: "first.ts", language: "typescript", introduced: true, checkpointed: false, sessionId: "saved", harness: "codex", harnesses: ["codex"], model: null,
    state: "ongoing", isCurrent: true, result: null, fragments: {}, messages: [{ id: "cached", role: "assistant", parts: [{ type: "text", content: "Already available learner guidance" }] }],
    lessons: [{ name: "first", title: "First lesson", summary: "One outcome", state: "ongoing", isCurrent: true }] };
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/control/courses") return route.fulfill({ json: [{
      workspaceId: "fast-workspace", dojo: "fast-course", kata: "first", mode: "katas", workspaceName: "Fast files", selected: true,
      sessionId: "saved", sessions: [{ lessonId: "first", sessionId: "saved" }],
    }] });
    if (url.pathname === "/api/control/courses/fast-course" || url.pathname === "/api/control/learning-sessions/saved") {
      return route.fulfill({ json: { id: "fast-course", title: "Fast Course", workspaceId: "fast-workspace", runId: "saved", mode: "katas", kata: "first", description: "", version: "", language: "TypeScript", tags: [], lessons: ["first"] } });
    }
    if (url.pathname === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (url.pathname.endsWith("/diagnostics")) return route.fulfill({ json: [] });
    if (url.pathname.endsWith("/completions")) return route.fulfill({ json: { from: 0, options: [] } });
    if (url.pathname.endsWith("/lessons/first")) {
      if (url.searchParams.get("prepare") === "false") return route.fulfill({ json: lesson });
      await agent.promise;
      if (!retry) return route.fulfill({ status: 502, json: { error: "Coding agent unavailable" } });
      return route.fulfill({ json: { ...lesson, messages: [{ id: "saved", role: "assistant", parts: [{ type: "text", content: "Your saved learner guidance" }] }] } });
    }
    return route.fulfill({ status: 404 });
  });
  try {
    await page.goto("/course/fast-course");
    const code = page.getByRole("textbox", { name: "Code editor", exact: true });
    await expect(code).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Already available learner guidance", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/session\/saved$/, { timeout: 5000 });
    await code.focus();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("// Keep this while the agent reconnects");
    agent.resolve();
    await expect(page.getByRole("alert").filter({ hasText: "Coding agent unavailable" })).toBeVisible();
    retry = true;
    await page.getByRole("button", { name: "Reload conversation", exact: true }).click();
    await expect(page.getByText("Your saved learner guidance", { exact: true })).toBeVisible();
    await expect(page.locator(".view-lines")).toContainText("Keep this while the agent reconnects");
    await expect(page.getByTestId("chat-composer").getByRole("textbox")).toBeEnabled();
  } finally { agent.resolve(); }
});

test("continuing from the dashboard reuses its known session when discovery is unavailable", async ({ page }) => {
  let discoveryAvailable = true;
  let snapshotSessionId = "saved";
  const course = { workspaceId: "fast-workspace", runId: "saved-run", dojo: "fast-course", title: "Fast Course", kata: "first", mode: "katas", workspaceName: "Fast files", language: "TypeScript", selected: true,
    sessionId: "saved", sessions: [{ lessonId: "first", sessionId: "saved" }] };
  await page.routeWebSocket("**/api/session*", () => {});
  await page.route("**/api/**", route => {
    if (new URL(route.request().url()).pathname === "/api/local/setup") return route.fallback();
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/control/courses") return discoveryAvailable ? route.fulfill({ json: [course] }) : route.abort();
    if (path === "/api/control/courses/fast-course") return route.fulfill({ json: { id: "fast-course", title: "Fast Course", workspaceId: "fast-workspace", runId: "saved-run", mode: "katas", kata: "first", description: "", version: "", language: "TypeScript", tags: [], lessons: ["first"] } });
    if (path === "/api/control/learning-sessions/saved-run") return route.fulfill({ json: { id: "fast-course", title: "Fast Course", workspaceId: "fast-workspace", runId: "saved-run", mode: "katas", kata: "first", description: "", version: "", language: "TypeScript", tags: [], lessons: ["first"] } });
    if (path === "/api/control/authoring") return route.fulfill({ json: [] });
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [] } });
    if (path.endsWith("/lessons/first")) return route.fulfill({ json: {
      dojo: "fast-course", kata: "first", title: "First lesson", briefing: "One outcome", code: "export const answer = 0;", starterCode: "export const answer = 0;",
      fileId: "solution", filePath: "first.ts", language: "typescript", introduced: true, checkpointed: false, sessionId: snapshotSessionId, harness: "codex", harnesses: ["codex"], model: null,
      state: "ongoing", isCurrent: true, result: null, fragments: {}, messages: [{ id: "saved", role: "assistant", parts: [{ type: "text", content: "Continue your saved lesson" }] }],
      lessons: [{ name: "first", title: "First lesson", summary: "One outcome", state: "ongoing", isCurrent: true }],
    } });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/");
  const entry = page.getByRole("link", { name: "Fast Course", exact: true });
  await expect(entry).toBeVisible();
  discoveryAvailable = false;
  await entry.click();
  await expect(page).toHaveURL(/\/session\/saved-run$/);
  await expect(page.getByRole("textbox", { name: "Code editor", exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Continue your saved lesson", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Continue your saved lesson", { exact: true })).toBeVisible();
  // A lesson's own session address needs discovery to find its course, and only opens that exact session
  discoveryAvailable = true;
  await page.goto("/session/saved");
  await expect(page.getByText("Continue your saved lesson", { exact: true })).toBeVisible();
  snapshotSessionId = "another-conversation";
  await page.reload();
  await expect(page.getByRole("main", { name: "Something went wrong", exact: true })).toContainText("This exact lesson session is unavailable");
  await expect(page.getByText("Continue your saved lesson", { exact: true })).toHaveCount(0);
});
