import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Real built CLI, native ACP and files; only inference is scripted locally.
const repo = fileURLToPath(new URL("../../..", import.meta.url));
const artifacts = await mkdtemp(join(tmpdir(), "dojo-lesson-runtime-evidence-"));
console.log(`Lesson runtime evidence: ${artifacts}`);
const artifact = name => join(artifacts, name);
const { startLoopbackModel } = await import(pathToFileURL(join(repo, "packages/agent/experiments/model-provider/loopback-openai.mjs")));
const { opencodeExecutable } = await import(pathToFileURL(join(repo, "packages/ui/src/server/harness/opencode.ts")));
const { observeLocalContext } = await import(pathToFileURL(join(repo, "packages/config/dist/local-state.js")));
const scratch = await mkdtemp(join(tmpdir(), "dojo-lesson-introduction-"));
const source = join(scratch, "source");
const workspace = join(scratch, "workspace");
const stateHome = join(scratch, "state");
const endpoint = await startLoopbackModel();
const cli = join(repo, "packages/cli/dist/index.js");
const environment = { ...process.env, DOJOFOO_HOME: stateHome, DO_NOT_TRACK: "1",
  DOJOFOO_HARNESS: "opencode", OPENCODE_BIN: opencodeExecutable(),
  XDG_CONFIG_HOME: join(scratch, "config"), XDG_DATA_HOME: join(scratch, "data"), XDG_CACHE_HOME: join(scratch, "cache"),
  OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: "openai/gpt-4o", small_model: "openai/gpt-4o", enabled_providers: ["openai"],
    provider: { openai: { options: { baseURL: endpoint.baseURL, apiKey: "fixture-only" } } } }),
  DOJOFOO_MODEL: "", DOJOFOO_AUTHORING_MODEL: "", DOJOFOO_LESSON_MODEL: "", EVE_BASE_URL: "", DOJO_EVE_ROOT: "",
  OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: endpoint.baseURL, AI_GATEWAY_API_KEY: "", VERCEL_OIDC_TOKEN: "",
  NODE_PATH: undefined, CI: "", TEST: "" };
let server;
let output = "";
try {
  await mkdir(join(source, "lessons/first"), { recursive: true });
  await mkdir(workspace, { recursive: true });
  const vitest = join(repo, "node_modules/vitest/vitest.mjs");
  await writeFile(join(source, "dojo.yaml"), `mode: katas\nname: lesson-runtime-fixture\nversion: 0.0.1\ndescription: Practice a token counter.\nlanguage: JavaScript\ntest: node "${vitest}" run --globals {template}\nkatas:\n  - name: first\n    template: lessons/first/kata.mjs\n  - name: next\n    template: lessons/next/kata.mjs\n`);
  await writeFile(join(source, "lessons/first/kata.mjs"), '/**\n * Count the tokens in the fixture.\n * @returns The token count.\n * @example answer();\n */\nexport function answer() {\n  throw new Error("Count the tokens before checking again. This is actual fixture runner output, with enough detail to test wrapping in the results table.");\n}\n');
  await writeFile(join(source, "lessons/first/kata.test.mjs"), 'import { answer } from "./kata.mjs";\ndescribe("tokens", () => {\n  test("counts tokens", () => expect(answer()).toBe(42));\n  test("returns a number", () => expect(typeof answer()).toBe("number"));\n  test.skipIf((() => { try { return answer() !== 42; } catch { return true; } })())("optional vocabulary", () => expect(answer()).toBe(42));\n});\n');
  const preflightReport = join(scratch, "preflight.json");
  const runner = spawnSync(process.execPath, [vitest, "run", "--globals", "--reporter=json", `--outputFile=${preflightReport}`, "lessons/first/kata.test.mjs"], {
    cwd: source, env: environment, encoding: "utf8", timeout: 15_000,
  });
  await writeFile(artifact("fixture-runner-stdout.log"), runner.stdout ?? "");
  await writeFile(artifact("fixture-runner-stderr.log"), runner.stderr ?? "");
  assert.equal(JSON.parse(await readFile(preflightReport, "utf8")).numFailedTests, 2, "the standalone fixture runner must report two real failed tests before the browser starts");
  await writeFile(join(source, "lessons/first/SENSEI.md"), "# Token counter\n\n## Briefing\nCount the tokens in a short sentence.\n\n### Goal\nImplement `answer()`.\n\n```js\nanswer();\n```\n\n[Fixture reference](./reference.md)\n\n## Teacher guidance\nAsk the learner to try first.\n");
  await writeFile(join(source, "lessons/first/reference.md"), "Actual installed lesson reference.\n");
  await mkdir(join(source, "lessons/next"), { recursive: true });
  await writeFile(join(source, "lessons/next/kata.mjs"), "export const next = () => 0;\n");
  await writeFile(join(source, "lessons/next/SENSEI.md"), "# Next\n\n## Briefing\nRead the next goal without starting another lesson.\n");
  execFileSync(process.execPath, [cli, "add", source], { cwd: workspace, env: environment, stdio: "pipe", timeout: 30_000 });
  observeLocalContext(workspace, { stateHome });
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const launchServer = () => {
    const child = spawn(process.execPath, [cli, "ui", "--no-open", "--no-portless", "--port", String(port)], {
      cwd: workspace, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
      env: { ...environment, DOJO_PROJECT_ROOT: workspace, HOST: "127.0.0.1" },
    });
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    return child;
  };
  server = launchServer();
  const deadline = Date.now() + 30_000;
  let courses;
  while (Date.now() < deadline) {
    assert.equal(server.exitCode, null, output);
    try {
      const response = await fetch(`${origin}/api/control/courses`);
      if (response.ok) { courses = await response.json(); break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(courses?.length, 1, "one isolated installation must be discoverable");
  const base = `${origin}/api/workspaces/${encodeURIComponent(courses[0].workspaceId)}/courses/lesson-runtime-fixture/lessons/first`;
  const before = await fetch(base).then(response => response.json());
  assert.equal(before.introduced, false);
  assert.equal(before.briefingBasePath, "lessons/first");
  const began = performance.now();
  const response = await fetch(`${base}/messages`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ threadId: "lesson-probe", runId: crypto.randomUUID(), messages: [], tools: [], context: [], forwardedProps: { kind: "introduction" } }),
    signal: AbortSignal.timeout(60_000) });
  assert.equal(response.status, 200);
  const events = await response.text();
  assert.match(events, /Ready to teach\./);
  assert.match(events, /RUN_FINISHED/);
  assert.doesNotMatch(events, /RUN_ERROR/);
  const after = await fetch(base).then(response => response.json());
  assert.ok(after.sessionId);
  assert.equal(after.introduced, true);
  assert.ok(JSON.stringify(after.messages).includes("Ready to teach."));
  console.log(JSON.stringify({ elapsedMs: Math.round(performance.now() - began), inferenceRequests: endpoint.requests.length,
    paths: endpoint.paths, persistedSession: true, persistedIntroduction: true, restoredTranscript: true }));
  const { chromium, expect } = await import(pathToFileURL(join(repo, "packages/ui/node_modules/@playwright/test/index.mjs")));
  const browser = await chromium.launch({ headless: true });
  let page;
  const frames = [];
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const introductions = [];
    page.on("request", request => {
      if (request.method() === "POST" && request.url().endsWith("/messages") && request.postDataJSON()?.forwardedProps?.kind === "introduction") introductions.push(request.url());
    });
    page.on("pageerror", error => errors.push(error.message));
    page.on("websocket", socket => socket.on("framereceived", frame => { try { frames.push(JSON.parse(String(frame.payload))); } catch {} }));
    await page.goto(`${origin}/session/${after.sessionId}`);
    await expect(page.locator(".monaco-editor textarea")).toBeVisible();
    await expect(page.locator(".ui-ed .ui-ed__monaco")).toBeVisible();
    await expect(page.locator(".dojo-code-editor")).toHaveCount(0);
    let mountedEditor = await page.locator(".monaco-editor textarea").elementHandle();
    assert.equal(await page.evaluate(async () => {
      const faces = await document.fonts.load('16px "Iosevka"');
      return faces.length > 0 && faces.every(face => face.status === "loaded");
    }), true, "The real editor font must load from the built app");
    await page.locator(".view-lines").getByText("answer", { exact: true }).first().hover();
    const hover = page.locator(".monaco-hover:visible");
    await expect(hover).toContainText("Count the tokens in the fixture.");
    await expect(hover).toContainText("answer();");
    await page.screenshot({ path: artifact("real-editor-documentation.png") });
    await page.getByRole("tab", { name: "kata.mjs", exact: true }).click();
    await expect(page.locator(".ui-as-app")).toHaveCSS("height", "1000px");
    const currentUrl = page.url();
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByText("Read the next goal without starting another lesson.", { exact: true })).toBeVisible();
    assert.equal(page.url(), currentUrl);
    await expect(page.locator(".ui-lb .shiki")).toHaveCount(1);
    await expect(page.locator(".ui-lb pre code")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const resources = page.locator(".ui-lb__section");
    if (!await resources.evaluate(node => node.open)) await resources.locator("summary").click();
    const reference = resources.getByRole("link", { name: /Fixture reference/ });
    await expect(reference).toBeVisible();
    const resourceResponse = await page.request.get(new URL(await reference.getAttribute("href"), origin).href);
    assert.equal(resourceResponse.status(), 200);
    assert.match(await resourceResponse.text(), /Actual installed lesson reference/);
    const draft = page.getByRole("textbox", { name: "Message the sensei", exact: true });
    await draft.fill("Keep this unsent question");
    await page.getByRole("button", { name: "Hide chat", exact: true }).click();
    await expect(page.locator(".ui-as-app")).toHaveAttribute("data-aside-hidden", "");
    await page.getByRole("button", { name: "Show chat", exact: true }).click();
    await expect(draft).toHaveValue("Keep this unsent question");
    await draft.fill("");
    await page.getByRole("button", { name: "Show settings", exact: true }).click();
    await page.getByRole("tab", { name: "Material", exact: true }).click();
    await page.getByRole("button", { name: /^Text size:/ }).click();
    await page.getByRole("menuitemradio", { name: "Large", exact: true }).click();
    await expect(page.locator(".ui-lb")).toHaveCSS("font-size", "17px");
    await page.getByRole("button", { name: /^Resources:/ }).click();
    await page.getByRole("menuitemradio", { name: "Side panel", exact: true }).click();
    await expect(page.locator(".ui-lb")).toHaveAttribute("data-resources", "panel");
    await page.getByRole("button", { name: "Close settings", exact: true }).click();
    assert.equal(await page.locator(".monaco-editor textarea").evaluate((node, original) => node === original, mountedEditor), true,
      "Opening chat and settings must retain the real editor");
    frames.length = 0;
    await page.reload();
    await expect(page.locator(".monaco-editor textarea")).toBeVisible();
    await expect(page.locator(".ui-lb")).toHaveCSS("font-size", "17px");
    await expect(page.locator(".ui-lb")).toHaveAttribute("data-resources", "panel");
    mountedEditor = await page.locator(".monaco-editor textarea").elementHandle();
    await expect.poll(() => frames.some(frame => frame.method === "session.snapshot"), { timeout: 10_000 }).toBe(true);
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect.poll(() => {
      const error = frames.find(frame => frame.error);
      if (error) throw new Error(JSON.stringify(error.error));
      return frames.some(frame => frame.method === "lesson.check.completed");
    }, { timeout: 30_000 }).toBe(true);
    assert.equal(frames.find(frame => frame.method === "lesson.check.completed").params.observation.report.failed, 2);
    await page.getByRole("tab", { name: /Tests/ }).click();
    const results = page.getByRole("region", { name: "Test results", exact: true });
    await expect(results.getByRole("img", { name: "Failed", exact: true })).toHaveCount(2, { timeout: 30_000 });
    await expect(results.getByRole("img", { name: "Skipped", exact: true })).toHaveCount(1);
    await expect(results.locator(".shiki")).toHaveCount(2);
    await expect(results).toContainText("Count the tokens before checking again.");
    await expect(results.locator("[aria-expanded]")).toHaveCount(0);
    await expect(results.locator(".ui-test-duration").first()).toHaveCSS("text-align", "right");
    await expect(results.locator("pre").first()).toHaveCSS("white-space", "pre-wrap");
    await page.screenshot({ path: artifact("real-failed-results.png") });
    await results.locator(".ui-test-location").first().click();
    await expect(page.locator(".monaco-editor textarea")).toBeVisible();
    assert.equal(await page.locator(".monaco-editor textarea").evaluate((node, original) => node === original, mountedEditor), true,
      "Switching to results and revealing source must preserve the mounted editor");
    await expect(page.locator(".dojo-line-flash, .ui-ed-line-flash")).not.toHaveCount(0);
    const editor = page.locator(".monaco-editor textarea");
    await editor.focus();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    const solution = "export function answer() { return 42; }\n";
    await page.keyboard.insertText(solution);
    const [saved] = await Promise.all([
      page.waitForResponse(response => response.request().method() === "PUT" && response.url().endsWith("/files/solution")),
      page.getByRole("button", { name: "Save", exact: true }).click(),
    ]);
    assert.equal(saved.status(), 200);
    assert.equal(await readFile(join(workspace, after.filePath), "utf8"), solution);
    await editor.focus();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    const shortcutSolution = "export function answer() { return 42; } // Saved with the editor shortcut\n";
    await page.keyboard.insertText(shortcutSolution);
    const saves = [];
    page.on("request", request => { if (request.method() === "PUT" && request.url().endsWith("/files/solution")) saves.push(request); });
    const [shortcutSaved] = await Promise.all([
      page.waitForResponse(response => response.request().method() === "PUT" && response.url().endsWith("/files/solution")),
      page.keyboard.press(process.platform === "darwin" ? "Meta+S" : "Control+S"),
    ]);
    assert.equal(shortcutSaved.status(), 200);
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    assert.equal(saves.length, 1, "One editor shortcut must write the file once");
    assert.equal(await readFile(join(workspace, after.filePath), "utf8"), shortcutSolution);
    const inspectModels = () => page.evaluate(async () => {
      const { editor } = await import("modern-monaco/editor-core");
      return editor.getModels().map(model => ({ code: model.getValue(), version: model.getVersionId(), undo: model.canUndo(), redo: model.canRedo() }));
    });
    const beforeUndo = await inspectModels();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    const afterUndo = await inspectModels();
    await writeFile(artifact("undo-models.json"), JSON.stringify({ before: beforeUndo, after: afterUndo }, null, 2));
    assert.equal(beforeUndo.length, 1);
    assert.equal(afterUndo.length, 1);
    assert.notEqual(afterUndo[0].code, beforeUndo[0].code, "Undo must change the existing model");
    assert.equal(afterUndo[0].redo, true);
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await editor.focus();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Y");
    await expect.poll(async () => (await inspectModels())[0]?.code).toBe(shortcutSolution);
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    assert.equal(saves.length, 1, "Undo and redo must not save without a save action");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.getByRole("tab", { name: /Tests/ }).click();
    await expect(results.getByRole("img", { name: "Passed", exact: true })).toHaveCount(3, { timeout: 30_000 });
    await expect(results.getByRole("img", { name: "Skipped", exact: true })).toHaveCount(0);
    await expect(results.getByRole("img", { name: "Failed", exact: true })).toHaveCount(0);
    await page.screenshot({ path: artifact("real-passed-results.png") });
    await page.reload();
    await expect(page.locator(".monaco-editor textarea")).toBeVisible();
    await expect(page.locator(".view-lines")).toContainText("return 42");
    const restored = await fetch(base).then(response => response.json());
    assert.equal(restored.sessionId, after.sessionId);
    assert.equal(restored.result.passed, 3);
    assert.equal(restored.result.skipped, 0);
    assert.equal(restored.code, shortcutSolution);
    assert.ok(JSON.stringify(restored.messages).includes("Ready to teach."));
    const pane = page.getByTestId("chat-pane");
    await expect(pane).toHaveAttribute("data-chat-status", "ready");
    const cancelQuestion = "Pause this fixture response until I cancel it";
    const held = endpoint.holdNextResponse(input => JSON.stringify(input.input ?? input.messages ?? []).includes(cancelQuestion));
    let modelConnectionClosed = false;
    held.closed.then(() => { modelConnectionClosed = true; });
    try {
      await page.getByRole("textbox", { name: "Message the sensei", exact: true }).fill(cancelQuestion);
      await page.getByRole("textbox", { name: "Message the sensei", exact: true }).press("Enter");
      await expect.poll(() => endpoint.requests.some(input => JSON.stringify(input.input ?? input.messages ?? []).includes(cancelQuestion)), { timeout: 10_000 }).toBe(true);
      await held.started;
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await expect.poll(() => modelConnectionClosed, { timeout: 10_000 }).toBe(true);
      await expect(pane).toHaveAttribute("data-chat-status", "ready");
      await expect(pane).not.toHaveAttribute("data-chat-error", /.+/);
    } finally { held.release(); }
    const modelOption = restored.model?.options.find(option => option.value === "openai/gpt-4o-mini")
      ?? restored.model?.options.find(option => option.value.startsWith("openai/") && option.value !== restored.model.currentValue);
    assert.ok(modelOption, "The configured native provider must advertise a second real model for this gate");
    const [configured] = await Promise.all([
      page.waitForResponse(response => response.request().method() === "PUT" && response.url().endsWith("/configuration/model")),
      (async () => {
        await page.getByRole("button", { name: "Harness model", exact: true }).click();
        await page.getByRole("menuitemradio", { name: modelOption.group ? `${modelOption.group} · ${modelOption.name}` : modelOption.name, exact: true }).click();
      })(),
    ]);
    assert.equal(configured.status(), 200);
    const selected = await fetch(base).then(response => response.json());
    assert.equal(selected.sessionId, after.sessionId);
    assert.equal(selected.model.currentValue, modelOption.value);
    const replyCount = snapshot => snapshot.messages.filter(message => message.role === "assistant" && message.parts.some(part => part.type === "text" && part.content.includes("Ready to teach."))).length;
    const followUp = "What should I try next in this lesson?";
    const requestCount = endpoint.requestedModels.length;
    await page.getByRole("textbox", { name: "Message the sensei", exact: true }).fill(followUp);
    await page.getByRole("textbox", { name: "Message the sensei", exact: true }).press("Enter");
    await expect.poll(async () => replyCount(await fetch(base).then(response => response.json())), { timeout: 15_000 }).toBe(replyCount(selected) + 1);
    await expect(pane).toHaveAttribute("data-chat-status", "ready");
    const answered = await fetch(base).then(response => response.json());
    assert.ok(JSON.stringify(answered.messages).includes(followUp));
    assert.equal(answered.sessionId, after.sessionId);
    assert.ok(endpoint.requestedModels.slice(requestCount).includes(modelOption.value.slice("openai/".length)), "The next native inference request must use the selected model");
    assert.deepEqual(errors, []);
    assert.deepEqual(introductions, [], "Restoring an introduced lesson must not send another introduction");
    assert.equal(answered.result.complete, true);
    const [progressed] = await Promise.all([
      page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/progressions")),
      page.getByRole("button", { name: "Continue to next lesson", exact: true }).click(),
    ]);
    assert.equal(progressed.status(), 200);
    await expect(page.locator(".view-lines")).toContainText("const next");
    await expect.poll(async () => (await fetch(base.replace(/\/first$/, "/next")).then(response => response.json())).introduced, { timeout: 15_000 }).toBe(true);
    await expect(page.getByRole("link", { name: /^First\b/ })).toBeVisible();
    await page.getByRole("link", { name: /^First\b/ }).click();
    await expect(page.locator(".view-lines")).toContainText("return 42");
    await expect(page.getByRole("button", { name: "Check", exact: true })).toHaveCount(0);
    const original = await inspectModels();
    assert.equal(original.length, 1);
    await page.locator(".monaco-editor textarea").focus();
    await page.keyboard.insertText("Forbidden edit");
    assert.equal((await inspectModels())[0].code, original[0].code, "A completed lesson's editor must remain read-only");
    const completedSnapshot = await fetch(base).then(response => response.json());
    assert.equal(completedSnapshot.isCurrent, false);
    assert.equal(completedSnapshot.state, "completed");
    assert.equal(completedSnapshot.sessionId, after.sessionId);
    assert.equal(completedSnapshot.code, shortcutSolution);
    await page.screenshot({ path: artifact("real-completed-lesson.png") });
    const restoredUrl = page.url();
    const oldReplies = replyCount(completedSnapshot);
    const sentIntroductions = introductions.length;
    await stopServer();
    server = launchServer();
    await expect.poll(async () => {
      try { return (await fetch(`${origin}/api/control/courses`)).status; } catch { return 0; }
    }, { timeout: 30_000 }).toBe(200);
    await page.goto(restoredUrl);
    await expect(page.locator(".view-lines")).toContainText("return 42");
    await expect(page.getByTestId("chat-pane")).toHaveAttribute("data-chat-status", "ready");
    const restarted = await fetch(base).then(response => response.json());
    assert.equal(restarted.sessionId, after.sessionId);
    assert.equal(restarted.code, shortcutSolution);
    assert.equal(restarted.result.complete, true);
    assert.equal(restarted.model.currentValue, modelOption.value);
    assert.equal(replyCount(restarted), oldReplies);
    assert.equal(introductions.length, sentIntroductions, "Restart must not reintroduce the restored lesson");
    assert.deepEqual(errors, []);

    console.log("Real CLI/browser: UIX workspace/editor/composer, real resources, reading preferences, chat visibility, native JSDoc, single-write save, undo/redo, checks, same-session reload, physical cancellation, next-turn model selection, progression, read-only completed lesson and server-restart restoration passed.");
  } catch (error) {
    if (page) {
      await page.screenshot({ path: artifact("results-failure.png") });
      await writeFile(artifact("results-failure.html"), await page.content());
      await writeFile(artifact("results-failure-frames.json"), JSON.stringify(frames, null, 2));
    }
    throw error;
  } finally { await browser.close(); }
} catch (error) {
  console.error(output);
  throw error;
} finally {
  await stopServer();
  await endpoint.close();
  await rm(scratch, { recursive: true, force: true });
}

async function stopServer() {
  if (!server?.pid || server.exitCode !== null || server.signalCode !== null) return;
  const child = server;
  const processGroup = child.pid;
  const closed = once(child, "close");
  const kill = signal => {
    try {
      if (process.platform === "win32") child.kill(signal); else process.kill(-processGroup, signal);
    } catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  const timer = setTimeout(() => kill("SIGKILL"), 5_000);
  try { kill("SIGTERM"); await closed; }
  finally {
    clearTimeout(timer);
    if (process.platform !== "win32") {
      // Reap any server descendants after the CLI leader exits. Signaling an
      // empty process group can return EPERM on macOS; inspect actual members.
      const members = execFileSync("ps", ["-axo", "pid=,pgid="], { encoding: "utf8" }).trim().split("\n")
        .map(line => line.trim().split(/\s+/).map(Number)).filter(([, group]) => group === processGroup);
      for (const [pid] of members) {
        try { process.kill(pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      }
    }
  }
}
