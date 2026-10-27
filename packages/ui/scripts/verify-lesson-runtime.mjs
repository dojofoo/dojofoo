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
  await writeFile(join(source, "dojo.yaml"), `mode: katas\nname: lesson-runtime-fixture\nversion: 0.0.1\ndescription: Practice a token counter.\nlanguage: JavaScript\ntest: node "${vitest}" run --globals {template}\nkatas:\n  - name: first\n    template: lessons/first/kata.mjs\n`);
  await writeFile(join(source, "lessons/first/kata.mjs"), 'export function answer() {\n  throw new Error("Count the tokens before checking again. This is actual fixture runner output, with enough detail to test wrapping in the results table.");\n}\n');
  await writeFile(join(source, "lessons/first/kata.test.mjs"), 'import { answer } from "./kata.mjs";\ndescribe("tokens", () => {\n  test("counts tokens", () => expect(answer()).toBe(42));\n  test("returns a number", () => expect(typeof answer()).toBe("number"));\n  test.skip("optional vocabulary", () => {});\n});\n');
  const preflightReport = join(scratch, "preflight.json");
  const runner = spawnSync(process.execPath, [vitest, "run", "--globals", "--reporter=json", `--outputFile=${preflightReport}`, "lessons/first/kata.test.mjs"], {
    cwd: source, env: environment, encoding: "utf8", timeout: 15_000,
  });
  await writeFile(artifact("fixture-runner-stdout.log"), runner.stdout ?? "");
  await writeFile(artifact("fixture-runner-stderr.log"), runner.stderr ?? "");
  assert.equal(JSON.parse(await readFile(preflightReport, "utf8")).numFailedTests, 2, "the standalone fixture runner must report two real failed tests before the browser starts");
  await writeFile(join(source, "lessons/first/SENSEI.md"), "# Token counter\n\n<dojo:senpai>Count the tokens in a short sentence.</dojo:senpai>\n\n<dojo:sensei>Teach this one token-counter lesson. Ask the learner to try first.</dojo:sensei>\n");
  execFileSync(process.execPath, [cli, "add", source], { cwd: workspace, env: environment, stdio: "pipe", timeout: 30_000 });
  observeLocalContext(workspace, { stateHome });
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [cli, "ui", "--no-open", "--no-portless", "--port", String(port)], {
    cwd: workspace, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
    env: { ...environment, DOJO_PROJECT_ROOT: workspace, HOST: "127.0.0.1" },
  });
  server.stdout.on("data", chunk => { output += chunk; });
  server.stderr.on("data", chunk => { output += chunk; });
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
    await expect(page.locator(".dojo-line-flash, .ui-ed-line-flash")).not.toHaveCount(0);
    const editor = page.locator(".monaco-editor textarea");
    await editor.focus();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    const solution = "export function answer() { return 42; }\n";
    await page.keyboard.insertText(solution);
    const saved = page.waitForResponse(response => response.request().method() === "PUT" && response.url().endsWith("/files/solution"));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    assert.equal((await saved).status(), 200);
    assert.equal(await readFile(join(workspace, after.filePath), "utf8"), solution);
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.getByRole("tab", { name: /Tests/ }).click();
    await expect(results.getByRole("img", { name: "Passed", exact: true })).toHaveCount(2, { timeout: 30_000 });
    await expect(results.getByRole("img", { name: "Skipped", exact: true })).toHaveCount(1);
    await expect(results.getByRole("img", { name: "Failed", exact: true })).toHaveCount(0);
    await page.screenshot({ path: artifact("real-passed-results.png") });
    await page.reload();
    await expect(page.locator(".monaco-editor textarea")).toBeVisible();
    await expect(page.locator(".view-lines")).toContainText("return 42");
    const restored = await fetch(base).then(response => response.json());
    assert.equal(restored.sessionId, after.sessionId);
    assert.equal(restored.result.passed, 2);
    assert.equal(restored.result.skipped, 1);
    assert.equal(restored.code, solution);
    assert.ok(JSON.stringify(restored.messages).includes("Ready to teach."));
    assert.deepEqual(errors, []);
    assert.deepEqual(introductions, [], "Restoring an introduced lesson must not send another introduction");
    console.log("Real CLI/browser: failing and passing checks, skipped state, Shiki, wrapped output, source reveal, file save and same-session reload passed.");
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
  if (server?.pid && server.exitCode === null && server.signalCode === null) {
    const closed = once(server, "close");
    if (process.platform === "win32") server.kill("SIGTERM"); else process.kill(-server.pid, "SIGTERM");
    await closed;
  }
  await endpoint.close();
  await rm(scratch, { recursive: true, force: true });
}
