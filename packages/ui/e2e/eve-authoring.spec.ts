import { expect, test } from "@playwright/test";
import type { MessageStreamEvent } from "@dojofoo/agent/client";
import { mountAgentChat } from "./agent-chat.fixture";
import { turn } from "../../agent-api/src/fixtures";

const draft = { root: "/tmp/eve-course", style: "katas", name: "Eve course", description: "Author a course together", language: "TypeScript", manifestSource: "name: Eve course\n", courseGuidance: "# Course", rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: "name: Eve course\n" }], lessons: [], issues: [], courseChecks: [] };
const data = { sequence: 1, turnId: "turn-1", stepIndex: 0 };
const meta = { id: "fixture", at: "2026-09-13T00:00:00Z" };
const wait: MessageStreamEvent = { type: "session.waiting", data: { continuationToken: "saved", wait: "next-user-message" }, meta };
let agent: Awaited<ReturnType<typeof mountAgentChat>>;
let historyUnavailable = false;
test.beforeEach(async ({ page }) => {
  historyUnavailable = false;
  agent = await mountAgentChat(page, { root: draft.root, files: false, failRead: () => historyUnavailable });
});

test("restored authoring conversations show their original attachments", async ({ page }) => {
  agent.eve.histories.set("saved", [{ type: "message.received", data: { ...data, message: "Use this outline and recording.", parts: [
    { type: "text", text: "Use this outline and recording." },
    { type: "file", mediaType: "image/svg+xml", filename: "outline.svg", url: "/saved-outline.svg" },
    { type: "file", mediaType: "application/pdf", filename: "brief.pdf", url: "/saved-brief.pdf" },
    { type: "file", mediaType: "audio/wav", filename: "notes.wav", url: "/saved-notes.wav" },
    { type: "file", mediaType: "video/webm", filename: "demo.webm", url: "/saved-demo.webm" },
  ] }, meta }, wait]);
  await page.route("**/saved-outline.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="teal"/></svg>' }));
  await page.route("**/saved-notes.wav", route => route.fulfill({ contentType: "audio/wav", body: Buffer.from("UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==", "base64") }));
  await page.route("**/saved-demo.webm", route => route.fulfill({ contentType: "video/webm", path: new URL("../../uix/public/fixtures/lesson-video.webm", import.meta.url).pathname }));
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/authoring?session=saved");
  await expect(page.getByText("Use this outline and recording.", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "outline.svg", exact: true })).toBeVisible({ timeout: 5000 });
  await expect.poll(() => page.getByRole("img", { name: "outline.svg", exact: true }).evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(160);
  await expect(page.getByRole("link", { name: "brief.pdf", exact: true })).toHaveAttribute("href", "/saved-brief.pdf");
  await expect(page.locator('audio[aria-label="notes.wav"]')).toHaveAttribute("controls", "");
  await expect(page.locator('video[aria-label="demo.webm"]')).toHaveAttribute("controls", "");
  for (const media of ["audio", "video"]) {
    expect(await page.locator(media).evaluate(async (node: HTMLMediaElement) => {
      node.muted = true;
      await node.play();
      node.pause();
      return node.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    })).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath("restored-attachments.png"), animations: "disabled" });
});

test("Pages navigation filters nested authoring files and preserves selection across renames", async ({ page }) => {
  let current = { ...draft, rootFiles: [...draft.rootFiles,
    { path: "package.json", label: "package.json", content: "{}" },
    { path: ".agents/skills/course/SKILL.md", label: "SKILL.md", content: "# Real guidance" },
  ], lessons: [{ id: "first", title: "First lesson", senseiPath: "src/first/SENSEI.md", description: "", checks: [],
    files: [{ path: "src/first/SENSEI.md", label: "SENSEI.md", content: "# Teach" }] }] };
  const renames: unknown[] = [];
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: current });
    if (route.request().method() === "PATCH") {
      const { title } = route.request().postDataJSON();
      renames.push({ path, title });
      current = path.endsWith("/course") ? { ...current, name: title }
        : { ...current, lessons: current.lessons.map(lesson => ({ ...lesson, title })) };
      return route.fulfill({ json: current });
    }
    return route.fulfill({ status: 404, json: { error: "Unexpected request" } });
  });
  await page.goto("/authoring?session=saved");
  await expect(page.getByRole("tab", { name: "dojo.yaml", exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Main menu" });
  await expect(navigation.getByRole("tree")).toHaveCount(0);
  await expect(navigation.locator("button button")).toHaveCount(0);
  await expect(navigation.getByRole("button", { name: "package.json", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Course actions", exact: true }).click();
  const boxStyle = (node: Element) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, radius: style.borderRadius, shadow: style.boxShadow };
  };
  const menuStyle = await page.getByRole("dialog").evaluate(boxStyle);
  await page.getByRole("menuitemradio", { name: "Show all files", exact: true }).click();
  for (const name of [".agents", "skills", "course"]) await navigation.getByRole("button", { name, exact: true }).click();
  await navigation.getByRole("button", { name: "SKILL.md", exact: true }).click();
  const tab = page.getByRole("tab", { name: "SKILL.md", exact: true });
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("# Real guidance");
  const rename = async (from: string, to: string) => {
    await navigation.getByRole("button", { name: from, exact: true }).hover();
    await navigation.getByRole("button", { name: `Rename ${from}`, exact: true }).click();
    const popup = page.getByRole("dialog");
    expect(await popup.evaluate(boxStyle)).toEqual(menuStyle);
    await popup.getByRole("textbox", { name: "Title", exact: true }).fill(to);
    await page.screenshot({ path: test.info().outputPath(`rename-${from.replace(/\W+/gu, "-")}.png`), animations: "disabled" });
    await popup.getByRole("button", { name: "Rename", exact: true }).click();
    await expect(navigation.getByRole("button", { name: to, exact: true })).toBeVisible();
  };
  await rename("Eve course", "Renamed draft");
  await rename("First lesson", "Revised lesson");
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Course actions", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Show only course files", exact: true }).click();
  await expect(navigation.getByRole("button", { name: "SKILL.md", exact: true })).toHaveCount(0);
  await expect(tab).toHaveAttribute("aria-selected", "true");
  expect(renames).toEqual([
    { path: "/api/authoring/course", title: "Renamed draft" },
    { path: "/api/authoring/lessons/first", title: "Revised lesson" },
  ]);
  await page.screenshot({ path: test.info().outputPath("authoring-pages-navigation.png"), animations: "disabled" });
});

test("the Pages brief shows scoped readiness findings without an empty box", async ({ page }) => {
  const workspace = { ...draft, courseChecks: [
    { id: "intent", label: "Course intent and teaching rules", ready: true },
  ], lessons: [{ id: "first", title: "First lesson", senseiPath: "src/first/SENSEI.md", description: "A focused learner outcome", checks: [
    { id: "sensei", label: "Lesson briefing and Sensei guidance", ready: true },
    { id: "scaffold", label: "Learner scaffold and checks", ready: false, findings: ["Add a revealing edge case."] },
  ], files: [{ path: "src/first/SENSEI.md", label: "SENSEI.md", content: "# Teach" }] },
  { id: "empty", title: "Unchecked lesson", senseiPath: "src/empty/SENSEI.md", description: "No preflight result yet", checks: [],
    files: [{ path: "src/empty/SENSEI.md", label: "SENSEI.md", content: "# Draft" }] }] };
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: workspace });
    if (path.endsWith("/report")) return route.fulfill({ json: { root: draft.root, report: null } });
    return route.fulfill({ status: 404, json: { error: "Unexpected request" } });
  });
  await page.goto("/authoring?session=saved");
  const readiness = page.getByRole("region", { name: "Readiness", exact: true });
  await expect(readiness).toContainText("Course intent and teaching rules");
  const nav = page.getByRole("navigation", { name: "Main menu" });
  const firstLesson = nav.getByRole("button", { name: "First lesson", exact: true });
  await expect(firstLesson).toHaveAttribute("aria-expanded", "true");
  await nav.locator('[id$="authoring:lesson:first-list"]').getByRole("button", { name: "SENSEI.md", exact: true }).click();
  await expect(readiness).toContainText("Add a revealing edge case.");
  await expect(readiness).not.toContainText("Course intent and teaching rules");
  await expect(readiness.getByRole("img", { name: "Ready", exact: true })).toHaveCount(1);
  await expect(readiness.getByRole("img", { name: "Needs attention", exact: true })).toHaveCount(1);
  expect(await readiness.evaluate(node => {
    const style = getComputedStyle(node);
    return { border: style.borderTopWidth, background: style.backgroundColor, overflows: node.scrollWidth > node.clientWidth };
  })).toEqual({ border: "0px", background: "rgba(0, 0, 0, 0)", overflows: false });
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("# Teach");
  await page.screenshot({ path: test.info().outputPath("authoring-readiness.png"), animations: "disabled" });
  await nav.getByRole("button", { name: "Unchecked lesson", exact: true }).click();
  await nav.locator('[id$="authoring:lesson:empty-list"]').getByRole("button", { name: "SENSEI.md", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Unchecked lesson", exact: true })).toBeVisible();
  await expect(readiness).toHaveCount(0);
});

test("the Pages evaluation view keeps real findings and the unsaved editor model", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const writes: string[] = [];
  const lesson = { id: "first", title: "First lesson", senseiPath: "src/first/SENSEI.md", description: "", checks: [],
    files: [{ path: "src/first/SENSEI.md", label: "SENSEI.md", content: "# Teach" }] };
  const report = { version: 1, directory: "/evidence/first", lessonIds: ["prior", "first"], materialHash: "fixture", stage: "teaching", status: "teaching-failed", startedAt: "start", completedAt: "end",
    teaching: [{ judge: "Independent judge", root: "/judge", promptHash: "fixture", verdict: { overall: "fail", limitation: "Only simulated learners were tested.", criteria: [
      { id: "adaptive-instruction", pass: false, evidence: "Repeated an unexplained term.", improvement: "Explain the missing concept before asking again." },
      { id: "solution-withholding", pass: true, evidence: "The learner wrote the solution." },
    ] } }], decisions: { teaching: { outcome: "pass", blocking: [], disputed: [{ id: "adaptive-instruction", judges: ["Independent judge"] }] } } };
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") writes.push(path);
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: { ...draft, lessons: [lesson] } });
    if (path.endsWith("/report")) return route.fulfill({ json: { root: draft.root, report } });
    return route.fulfill({ status: 404, json: { error: "Unexpected request" } });
  });
  await page.goto("/authoring?session=saved");
  await page.getByRole("navigation", { name: "Main menu" }).getByRole("button", { name: "SENSEI.md", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Code editor" });
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("# Teach");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\nUnsaved guidance");
  const mounted = await page.locator(".monaco-editor[data-uri]").elementHandle();
  await page.getByRole("button", { name: "Evaluation results", exact: true }).click();
  await expect(page.getByRole("region", { name: "Evals", exact: true })).toBeVisible({ timeout: 5000 });
  const result = page.getByRole("region", { name: "Teaching evaluation report", exact: true });
  await expect(result).toContainText("first · teaching");
  await expect(result).toContainText("These lessons were not re-evaluated.");
  await expect(result.getByRole("table")).toBeVisible();
  await expect(result).toContainText("disputed (one judge)");
  await expect(result).toContainText("Explain the missing concept before asking again.");
  await expect(result).not.toContainText("Cost per 1k runs");
  await result.getByRole("radio", { name: "Disputed", exact: true }).click();
  await expect(result).not.toContainText("The learner wrote the solution.");
  await result.getByRole("radio", { name: "Pass", exact: true }).click();
  await expect(result).toContainText("The learner wrote the solution.");
  await expect(result).not.toContainText("Repeated an unexplained term.");
  await result.getByRole("radio", { name: "All", exact: true }).click();
  expect(await mounted!.evaluate(node => node.isConnected)).toBe(true);
  await expect(editor).toBeHidden();
  await page.screenshot({ path: test.info().outputPath("authoring-evaluation.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(result.getByRole("table")).toBeVisible();
  await expect(result).toContainText("Explain the missing concept before asking again.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const badge = await result.getByText("disputed (one judge)", { exact: true }).evaluate(node => {
    const text = document.createRange(); text.selectNodeContents(node);
    return { box: node.getBoundingClientRect().height, text: text.getBoundingClientRect().height };
  });
  expect(badge.text).toBeLessThanOrEqual(badge.box);
  await page.screenshot({ path: test.info().outputPath("authoring-evaluation-phone.png"), animations: "disabled" });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Hide evals", exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("Unsaved guidance");
  expect(await mounted!.evaluate(node => node.isConnected)).toBe(true);
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".monaco-editor .view-lines")).not.toContainText("Unsaved guidance");
  expect(writes).toEqual([]);
});

test("reloading conversation history preserves editor text and undo", async ({ page }) => {
  historyUnavailable = true;
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    return route.fulfill({ status: 404, json: { error: "Unexpected request" } });
  });
  await page.goto("/authoring?session=saved");
  await expect(page.getByRole("button", { name: "Reload conversation" })).toBeVisible();
  const editor = page.getByRole("textbox", { name: "Code editor" });
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("# unsaved draft");
  historyUnavailable = false;
  await page.getByRole("button", { name: "Reload conversation" }).click();
  await expect(page.getByRole("button", { name: "Reload conversation" })).toHaveCount(0);
  await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeEnabled();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("# unsaved draft");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".monaco-editor .view-lines")).not.toContainText("# unsaved draft");
});

test("course files can be retried without replacing the conversation", async ({ page }) => {
  let repaired = false;
  agent.eve.histories.set("saved", turn("prior", "Keep my existing course conversation", ["Your saved guidance."]));
  let changed: () => void = () => {};
  await page.routeWebSocket("**/api/authoring/changes*", socket => {
    changed = () => socket.send(JSON.stringify({ method: "workspace.changed" }));
  });
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/draft")) return repaired
      ? route.fulfill({ json: draft })
      : route.fulfill({ status: 503, json: { error: "Course files unavailable" } });
    return route.fulfill({ status: 404, json: { error: "Unexpected route" } });
  });
  await page.goto("/authoring?workspace=ws-1&session=saved");
  await expect(page.getByRole("alert").filter({ hasText: "Course files unavailable" })).toBeVisible();
  // Saved guidance and draft input remain available while startup is repaired.
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/draft"));
  changed();
  await refreshed;
  await expect(page.getByText("Keep my existing course conversation", { exact: true })).toBeVisible();
  const question = page.getByTestId("authoring-chat-composer").getByRole("textbox");
  await question.fill("Keep this unsent note");
  repaired = true;
  await expect(page.getByRole("button", { name: "Reload workspace", exact: true })).toBeVisible({ timeout: 2000 });
  await page.getByRole("button", { name: "Reload workspace", exact: true }).click();
  await expect(question).toHaveValue("Keep this unsent note");
  await expect(page.getByText("Keep my existing course conversation", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/session=saved/);
  expect([...agent.eve.histories.keys()]).toEqual(["saved"]);
});

test("a failed save stays with its file and preserves the unsaved content", async ({ page }) => {
  const files = [...draft.rootFiles, { path: "DOJO.md", label: "DOJO.md", content: "# Course guidance" }];
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: { ...draft, rootFiles: files } });
    if (path.includes("/files/")) return route.fulfill({ status: 422, json: { error: "Fixture save rejected" } });
    return route.fulfill({ contentType: "text/event-stream", body: "" });
  });
  await page.goto("/authoring?session=saved");
  await page.getByRole("textbox", { name: "Code editor" }).focus();
  await page.keyboard.press("Meta+End");
  await page.keyboard.type("# unsaved");
  await page.keyboard.press("Meta+s");
  await expect(page.getByRole("alert").filter({ hasText: "Fixture save rejected" })).toBeVisible();
  await page.getByText("DOJO.md", { exact: true }).click();
  await expect(page.getByRole("tab", { name: "DOJO.md", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/Fixture save rejected/)).toHaveCount(0);
  await page.getByRole("tab", { name: /dojo.yaml/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Fixture save rejected" })).toBeVisible();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("# unsaved");
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.getByText(/Fixture save rejected/)).toHaveCount(0);
});

test("report loading errors stay with their lesson and clear after watcher recovery", async ({ page }) => {
  let failReport = true;
  let completedReport = false;
  let changed: () => void = () => {};
  await page.routeWebSocket("**/api/authoring/changes*", socket => {
    changed = () => socket.send(JSON.stringify({ method: "workspace.changed" }));
  });
  const lessons = ["first", "second"].map(id => ({ id, title: id, senseiPath: `src/${id}/SENSEI.md`, description: "", checks: [], files: [
    { path: `src/${id}/SENSEI.md`, label: "SENSEI.md", content: `# ${id}` },
  ] }));
  await page.route("**/api/authoring/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (url.pathname.endsWith("/draft")) return route.fulfill({ json: { ...draft, lessons } });
    if (url.pathname.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" }, messages: [] } });
    if (url.pathname.endsWith("/evaluation-settings")) return route.fulfill({ json: { enabled: true } });
    if (url.pathname.endsWith("/evals")) return route.fulfill({ status: 503, json: { error: "Judge unavailable" } });
    if (url.pathname.endsWith("/report")) {
      if (failReport && url.searchParams.get("lessonId") === "first") return route.fulfill({ status: 503, json: { error: "Report temporarily unavailable" } });
      return route.fulfill({ json: { root: draft.root, report: completedReport ? {
        version: 1, directory: "/tmp/eve-course/.dojo/evaluations/run-new", lessonIds: ["first"],
        materialHash: "fixture", stage: "teaching", status: "passed",
        startedAt: "2026-10-12T00:00:00Z", completedAt: "2026-10-12T00:01:00Z",
      } : null } });
    }
    return route.fulfill({ status: 404, json: { error: "Unexpected request" } });
  });
  await page.goto("/authoring?session=saved");
  const selectLesson = async (name: string) => {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.getAttribute("aria-expanded") !== "true") await button.click();
    const item = page.locator(".ui-as-side__branch").filter({ has: button });
    await item.getByRole("button", { name: "SENSEI.md", exact: true }).click();
  };
  await selectLesson("first");
  const alert = page.getByRole("alert").filter({ hasText: "Could not load this lesson" });
  await expect(alert).toBeVisible();
  await selectLesson("second");
  await expect(alert).toHaveCount(0);
  await selectLesson("first");
  await expect(alert).toBeVisible();
  failReport = false;
  changed();
  await expect(alert).toHaveCount(0);
  await page.getByRole("button", { name: "Evaluate lesson", exact: true }).click();
  const runError = page.getByRole("alert").filter({ hasText: "Judge unavailable" });
  await expect(runError).toBeVisible();
  const reloaded = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/report"));
  changed();
  await reloaded;
  await expect(runError).toBeVisible();
  completedReport = true;
  changed();
  await expect(runError).toHaveCount(0);
  await page.getByRole("button", { name: "Evaluation results", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tested scenarios passed" })).toBeVisible();
});

test("a late evaluation cannot replace another lesson's report", async ({ page }) => {
  const release = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const lessons = ["first", "second"].map(id => ({ id, title: id, senseiPath: `src/${id}/SENSEI.md`, description: "", checks: [], files: [
    { path: `src/${id}/SENSEI.md`, label: "SENSEI.md", content: `# ${id}` },
  ] }));
  const report = (id: string) => ({ version: 1, directory: `/evidence/${id}`, lessonIds: [id], materialHash: "fixture", stage: "teaching", status: "passed", startedAt: "start", completedAt: "end" });
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (url.pathname.endsWith("/draft")) return route.fulfill({ json: { ...draft, lessons } });
    if (url.pathname.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" }, messages: [] } });
    if (url.pathname.endsWith("/evaluation-settings")) return route.fulfill({ json: { enabled: true } });
    if (url.pathname.endsWith("/report")) return route.fulfill({ json: { root: draft.root, report: report(url.searchParams.get("lessonId")!) } });
    if (url.pathname.endsWith("/evals")) {
      started.resolve();
      await release.promise;
      return route.fulfill({ json: { root: draft.root, report: report("first") } });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto("/authoring?session=saved");
  const selectLesson = async (name: string) => {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.getAttribute("aria-expanded") !== "true") await button.click();
    const item = page.locator(".ui-as-side__branch").filter({ has: button });
    await item.getByRole("button", { name: "SENSEI.md", exact: true }).click();
  };
  await selectLesson("first");
  await page.getByRole("button", { name: "Evaluate lesson", exact: true }).click();
  await started.promise;
  await selectLesson("second");
  await page.getByRole("button", { name: "Evaluation results", exact: true }).click();
  const result = page.getByRole("region", { name: "Teaching evaluation report" });
  await expect(result).toContainText("second · teaching");
  release.resolve();
  await expect(page.getByRole("button", { name: "Evaluate lesson", exact: true })).toBeEnabled();
  await expect(result).toContainText("second · teaching");
  await selectLesson("first");
  await page.getByRole("button", { name: "Evaluation results", exact: true }).click();
  await expect(result).toContainText("first · teaching");
});

test("a course without lessons has no empty report button", async ({ page }) => {
  const posts: string[] = [];
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") posts.push(path);
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    if (path.endsWith("/report")) return route.fulfill({ json: { root: draft.root, report: {
      version: 1, directory: "/evidence", materialHash: "hash", lessonIds: ["001-first"],
      status: "teaching-failed", stage: "teaching", startedAt: "start", completedAt: "end",
      teaching: [{ judge: "Independent judge", root: "/judge", promptHash: "hash", verdict: {
        overall: "fail", limitation: "Simulated learners only.", criteria: [{
          id: "adaptive-instruction", pass: false,
          evidence: "Repeated an unexplained term.",
          improvement: "Explain the missing concept before asking again.",
        }],
      } }],
    } } });
    return route.fulfill({ contentType: "text/event-stream", body: "" });
  });
  await page.goto("/authoring?session=saved");
  await expect(page.getByRole("region", { name: "Course conversation", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Report|Evaluation results/ })).toHaveCount(0);
  expect(posts).toEqual([]);
});

test("evaluation settings save model choices, not secrets or worker paths, without starting an evaluation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const writes: unknown[] = [];
  const evaluations: string[] = [];
  const catalogs: Array<{ workspace: string | null; harness: string | null }> = [];
  await page.route("**/api/authoring/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    if (path.endsWith("/models")) {
      const params = new URL(route.request().url()).searchParams;
      catalogs.push({ workspace: params.get("workspace"), harness: params.get("harness") });
      return route.fulfill({ json: params.get("harness") === "pi"
        ? [{ id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", efforts: [] }]
        : [{ id: "zai/glm-5.3", name: "GLM 5.3", efforts: [] }] });
    }
    if (path.endsWith("/evaluation-settings")) {
      if (route.request().method() === "PUT") {
        const value = route.request().postDataJSON();
        writes.push(value);
        return route.fulfill({ json: value });
      }
      return route.fulfill({ json: null });
    }
    if (path.endsWith("/evals")) evaluations.push(path);
    return route.fulfill({ contentType: "text/event-stream", body: "" });
  });
  await mountAgentChat(page, { root: draft.root, workspaceId: "isolated-course", files: false });
  await page.goto("/authoring?session=saved&workspace=isolated-course");
  const composer = page.getByTestId("authoring-chat-composer");
  await expect(composer.getByRole("button", { name: "Add file", exact: true })).toBeEnabled();
  await expect(composer.getByRole("button", { name: "Agent", exact: true })).toContainText("Codex");
  await page.getByRole("button", { name: "You", exact: true }).click();
  const boxStyle = (node: Element) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, radius: style.borderRadius, shadow: style.boxShadow };
  };
  const accountMenuStyle = await page.locator(".ui-as-popover").evaluate(boxStyle);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Evaluation settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Teaching evaluations", exact: true });
  expect(await dialog.evaluate(boxStyle)).toEqual(accountMenuStyle);
  const teacherAgent = dialog.getByRole("button", { name: "teacher agent: OpenCode", exact: true });
  await expect(teacherAgent).toBeVisible({ timeout: 5000 });
  await teacherAgent.click();
  expect(await page.locator(".ui-as-popover").evaluate(boxStyle)).toEqual(accountMenuStyle);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(teacherAgent).toBeFocused();
  await teacherAgent.click();
  await page.getByRole("menuitemradio", { name: "Codex", exact: true }).click();
  await dialog.getByRole("button", { name: "teacher agent: Codex", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "OpenCode", exact: true }).click();
  await dialog.getByRole("button", { name: "Choose teacher model", exact: true }).click();
  expect(await page.locator(".ui-as-popover").evaluate(boxStyle)).toEqual(accountMenuStyle);
  await page.screenshot({ path: test.info().outputPath("authoring-settings-model-menu.png"), animations: "disabled" });
  await page.getByRole("menuitemradio", { name: /^GLM 5\.3/ }).click();
  await expect(dialog.getByRole("textbox", { name: "teacher model", exact: true })).toHaveValue("zai/glm-5.3");
  await dialog.getByRole("button", { name: "Choose learner model", exact: true }).click();
  await page.getByRole("menuitemradio", { name: /^DeepSeek V4 Pro/ }).click();
  await dialog.getByRole("textbox", { name: "learner model", exact: true }).fill("custom/provider-model");
  await expect(dialog.getByRole("textbox", { name: "learner model", exact: true })).toHaveValue("custom/provider-model");
  await dialog.getByRole("textbox", { name: "learner model", exact: true }).fill("deepseek/deepseek-v4-pro");
  await dialog.getByRole("switch", { name: "Allow teaching evaluations", exact: true }).click();
  const teacher = await dialog.getByRole("textbox", { name: "teacher model", exact: true }).boundingBox();
  const learner = await dialog.getByRole("textbox", { name: "learner model", exact: true }).boundingBox();
  expect(Math.abs(teacher!.x - learner!.x)).toBeLessThan(1);
  await page.screenshot({ path: test.info().outputPath("authoring-settings.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(dialog.getByRole("textbox", { name: "learner model", exact: true })).toHaveValue("deepseek/deepseek-v4-pro");
  await page.screenshot({ path: test.info().outputPath("authoring-settings-phone.png"), animations: "disabled" });
  await dialog.getByRole("button", { name: "Save evaluation settings" }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual([{ enabled: true, teacher: { harness: "opencode", model: "zai/glm-5.3" }, learner: { harness: "pi", model: "deepseek/deepseek-v4-pro" } }]);
  expect(evaluations).toEqual([]);
  expect(catalogs).toEqual(expect.arrayContaining([
    { workspace: "isolated-course", harness: "opencode" },
    { workspace: "isolated-course", harness: "pi" },
  ]));
});

test("evaluation settings cannot overwrite saved choices after a failed reload", async ({ page }) => {
  let broken = false;
  const writes: unknown[] = [];
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: draft });
    if (path.endsWith("/models")) return route.fulfill({ status: 502, contentType: "text/plain", body: "Model catalog unavailable" });
    if (path.endsWith("/evaluation-settings")) {
      if (route.request().method() === "PUT") writes.push(route.request().postDataJSON());
      return broken ? route.fulfill({ status: 503, contentType: "text/plain", body: "Settings storage unavailable" })
        : route.fulfill({ json: { enabled: true, teacher: { harness: "codex", model: "teacher" }, learner: { harness: "pi", model: "learner" } } });
    }
    return route.fulfill({ contentType: "text/event-stream", body: "" });
  });
  await page.goto("/authoring?session=saved");
  await page.getByRole("button", { name: "Evaluation settings", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: "teacher model", exact: true })).toHaveValue("teacher");
  await expect(dialog.getByText("Model catalog unavailable", { exact: true })).toHaveCount(2);
  await page.keyboard.press("Escape");
  broken = true;
  await page.getByRole("button", { name: "Evaluation settings", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Settings storage unavailable");
  await expect(dialog.getByRole("button", { name: "Save evaluation settings" })).toBeDisabled();
  await expect(dialog.getByRole("textbox", { name: "teacher model", exact: true })).toBeDisabled();
  expect(writes).toEqual([]);
});

for (const outcome of ["success", "failure"] as const) test(`a trial reserves its tab before preparation (${outcome})`, async ({ page, context }) => {
  test.setTimeout(60_000);
  const release = Promise.withResolvers<void>();
  const sessionStarts: unknown[] = [];
  await page.route("**/api/workspaces/trial-workspace/courses/trial-course/lessons/first/sessions", route => {
    expect(route.request().method()).toBe("POST");
    sessionStarts.push(route.request().postDataJSON());
    return route.fulfill({ json: {} });
  });
  await context.route("**/course/trial-workspace/trial-course/lesson/first", route => route.fulfill({ contentType: "text/html", body: "<h1>Prepared lesson</h1>" }));
  const lesson = { id: "first", title: "first", senseiPath: "src/first/SENSEI.md", description: "", checks: [], files: [{ path: "src/first/SENSEI.md", label: "SENSEI.md", content: "# First" }] };
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/authoring/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) return route.fulfill({ json: { ...draft, lessons: [lesson] } });
    if (path.endsWith("/report")) return route.fulfill({ json: { root: draft.root, report: null } });
    if (path.endsWith("/trials")) {
      await release.promise;
      return outcome === "failure"
        ? route.fulfill({ status: 503, json: { error: "Trial harness unavailable" } })
        : route.fulfill({ json: { workspaceId: "trial-workspace", courseId: "trial-course", lessonId: "first" } });
    }
    return route.fulfill({ contentType: "text/event-stream", body: "" });
  });
  await page.goto("/authoring?session=saved");
  const lessonButton = page.getByRole("button", { name: "first", exact: true });
  if (await lessonButton.getAttribute("aria-expanded") !== "true") await lessonButton.click();
  const lessonItem = page.locator(".ui-as-side__branch").filter({ has: lessonButton });
  await lessonItem.getByRole("button", { name: "SENSEI.md", exact: true }).click();
  if (outcome === "success") {
    const picker = page.getByRole("button", { name: "Trial agent: Configured trial agent", exact: true });
    await expect(picker).toBeVisible({ timeout: 5000 });
    await picker.click();
    await page.getByRole("menuitemradio", { name: "Codex", exact: true }).click();
  }
  const popup = page.waitForEvent("popup", { timeout: 5000 });
  await page.getByRole("button", { name: "Trial", exact: true }).click();
  const tab = await popup;
  expect(await tab.evaluate(() => window.opener)).toBeNull();
  release.resolve();
  if (outcome === "success") {
    await expect(tab.getByRole("heading", { name: "Prepared lesson" })).toBeVisible();
    expect(sessionStarts).toEqual([{ harness: "codex" }]);
    await expect(page).toHaveURL(/authoring\?session=saved/);
    await tab.close();
    return;
  }
  await expect.poll(() => tab.isClosed()).toBe(true);
  expect(sessionStarts).toEqual([]);
  await expect(page.getByRole("alert").filter({ hasText: "Trial harness unavailable" })).toBeVisible();
  await page.getByRole("tab", { name: "dojo.yaml", exact: true }).click();
  await expect(page.getByText(/Trial harness unavailable/)).toHaveCount(0);
});
