import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The built CLI, an installed kata course and kata Sensei on Eve through the native OpenCode harness. Only inference is scripted locally.
const repo = fileURLToPath(new URL("../../..", import.meta.url));
const artifacts = await mkdtemp(join(tmpdir(), "dojo-lesson-runtime-evidence-"));
console.log(`Lesson runtime evidence: ${artifacts}`);
const artifact = name => join(artifacts, name);
const { startLoopbackModel } = await import(pathToFileURL(join(repo, "packages/agent/experiments/model-provider/loopback-openai.mjs")));
const { observeLocalContext } = await import(pathToFileURL(join(repo, "packages/config/dist/local-state.js")));
const { readDojoRc } = await import(pathToFileURL(join(repo, "packages/config/dist/index.js")));
const { Client } = await import(pathToFileURL(join(repo, "packages/agent/dist/eve/dist/src/client/index.js")));
const scratch = await mkdtemp(join(tmpdir(), "dojo-lesson-runtime-"));
const source = join(scratch, "source");
const workspace = join(scratch, "workspace");
const stateHome = join(scratch, "state");
const course = "lesson-runtime-fixture";
const askPrompt = "Ask me which example I prefer.";
const completePrompt = "Complete this fixture lesson";
/** A prompt that calls `tool` once per time the script sends it (`armed`): the per-turn context quotes earlier messages as evidence,
 *  so the prompt's text alone can't tell a new message from a quoted one */
const armed = new Set();
const scripted = [{ prompt: askPrompt, tool: "ask_question", input: { question: "Which example do you prefer?" } }, { prompt: completePrompt, tool: "dojo_lesson_complete", input: {} }];
const endpoint = await startLoopbackModel({ selectResponsesTool(input) {
  const items = Array.isArray(input.input) ? input.input : [];
  const latest = items.findLastIndex(item => item.role === "user");
  if (latest < 0 || items.slice(latest).some(item => item.type === "function_call_output")) return undefined;
  const text = JSON.stringify(items[latest].content ?? "");
  const script = scripted.find(entry => armed.has(entry.prompt) && text.includes(entry.prompt));
  if (!script) return undefined;
  // OpenCode offers the host's tools as `harness-tools_<name>`
  const tool = (input.tools ?? []).find(candidate => candidate.name?.endsWith(script.tool));
  if (!tool) return undefined;
  armed.delete(script.prompt);
  return { name: tool.name, input: script.input };
} });
const cli = join(repo, "packages/cli/dist/index.js");
// Model discovery runs `$OPENCODE_BIN models`; a fixed catalog keeps the composer's menu the same on every machine (as test:interactive)
const discovery = join(scratch, "bin/opencode");
await mkdir(join(scratch, "bin"), { recursive: true });
await writeFile(discovery, '#!/bin/sh\n[ "$1" = models ] && printf "openai/gpt-4o\\nopenai/gpt-4o-mini\\n" && exit 0\nexit 1\n', { mode: 0o755 });
const environment = { ...process.env, DOJOFOO_HOME: stateHome, DO_NOT_TRACK: "1", OPENCODE_BIN: discovery,
  XDG_CONFIG_HOME: join(scratch, "config"), XDG_DATA_HOME: join(scratch, "data"), XDG_CACHE_HOME: join(scratch, "cache"),
  OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: endpoint.baseURL, AI_GATEWAY_API_KEY: "", VERCEL_OIDC_TOKEN: "", NODE_PATH: undefined, CI: "", TEST: "" };
delete environment.OPENCODE_CONFIG_CONTENT;
let server;
let output = "";
let browser;
let page;
let failureEvents;
/** Main-loop requests (those offering tools) whose JSON contains `text`, from request index `from` */
const carrying = (text, from = 0) => endpoint.requests.slice(from).filter((request, index) => endpoint.toolLists[from + index]?.length && JSON.stringify(request).includes(text));
try {
  await mkdir(join(source, "lessons/first"), { recursive: true });
  await mkdir(workspace, { recursive: true });
  const vitest = join(repo, "node_modules/vitest/vitest.mjs");
  await writeFile(join(source, "dojo.yaml"), `mode: katas\nname: ${course}\nversion: 0.0.1\ndescription: Practice a token counter.\nlanguage: JavaScript\ntest: node "${vitest}" run --globals {template}\nkatas:\n  - name: first\n    template: lessons/first/kata.mjs\n  - name: next\n    template: lessons/next/kata.mjs\n`);
  await writeFile(join(source, "DOJO.md"), "PRIVATE-GUIDANCE-KATA: Teach this course from its own authored notes.\n");
  await writeFile(join(source, "lessons/first/kata.mjs"), '/**\n * Count the tokens in the fixture.\n * @returns The token count.\n * @example answer();\n */\nexport function answer() {\n  throw new Error("Count the tokens before checking again. This is actual fixture runner output, with enough detail to test wrapping in the results table.");\n}\n');
  await writeFile(join(source, "lessons/first/kata.test.mjs"), 'import { answer } from "./kata.mjs";\ndescribe("tokens", () => {\n  test("counts tokens", () => expect(answer()).toBe(42));\n  test("returns a number", () => expect(typeof answer()).toBe("number"));\n  test.skipIf((() => { try { return answer() !== 42; } catch { return true; } })())("optional vocabulary", () => expect(answer()).toBe(42));\n});\n');
  const preflightReport = join(scratch, "preflight.json");
  const runner = spawnSync(process.execPath, [vitest, "run", "--globals", "--reporter=json", `--outputFile=${preflightReport}`, "lessons/first/kata.test.mjs"], {
    cwd: source, env: environment, encoding: "utf8", timeout: 15_000,
  });
  await writeFile(artifact("fixture-runner-stdout.log"), runner.stdout ?? "");
  await writeFile(artifact("fixture-runner-stderr.log"), runner.stderr ?? "");
  assert.equal(JSON.parse(await readFile(preflightReport, "utf8")).numFailedTests, 2, "the standalone fixture runner must report two real failed tests before the browser starts");
  await writeFile(join(source, "lessons/first/SENSEI.md"), "# Token counter\n\n## Briefing\nCount the tokens in a short sentence.\n\n### Goal\nImplement `answer()`.\n\n```js\nanswer();\n```\n\n[Fixture reference](./reference.md)\n\n## Teacher guidance\nAsk the learner to try first.\nKATA-SOURCE-first\n");
  await writeFile(join(source, "lessons/first/reference.md"), "Actual installed lesson reference.\n");
  await mkdir(join(source, "lessons/next"), { recursive: true });
  await writeFile(join(source, "lessons/next/kata.mjs"), "export const next = () => 0;\n");
  await writeFile(join(source, "lessons/next/SENSEI.md"), "# Next\n\n## Briefing\nRead the next goal without starting another lesson.\n\n## Teacher guidance\nKATA-SOURCE-next\n");
  const sourceFiles = async () => Promise.all(["dojo.yaml", "DOJO.md", "lessons/first/kata.mjs", "lessons/first/SENSEI.md", "lessons/next/SENSEI.md"].map(path => readFile(join(source, path), "utf8")));
  const sourceBefore = await sourceFiles();
  execFileSync(process.execPath, [cli, "add", source], { cwd: workspace, env: environment, stdio: "pipe", timeout: 30_000 });
  // The workspace's coding agent and its last model, as the composer's menus save them
  await mkdir(join(workspace, ".dojo"), { recursive: true });
  await writeFile(join(workspace, ".dojo/runtimes.json"), JSON.stringify({ agent: "opencode", models: { opencode: "openai/gpt-4o" } }));
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
  const { chromium, expect } = await import(pathToFileURL(join(repo, "packages/ui/node_modules/@playwright/test/index.mjs")));
  const ready = () => expect.poll(async () => { try { return (await fetch(`${origin}/api/control/courses`)).status; } catch { return 0; } }, { timeout: 30_000 }).toBe(200);
  await ready();
  const courses = await fetch(`${origin}/api/control/courses`).then(response => response.json());
  assert.equal(courses.length, 1, "one isolated installation must be discoverable");
  const workspaceId = courses[0].workspaceId;
  const agentApi = `${origin}/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;
  const lessonUrl = lesson => `${origin}/api/workspaces/${encodeURIComponent(workspaceId)}/courses/${course}/lessons/${lesson}`;
  const records = async lesson => (await fetch(`${agentApi}/sessions?persona=sensei&course=${course}&lesson=${lesson}`).then(response => response.json())).data;
  const snapshot = id => new Client({ baseUrl: `${agentApi}/sessions/${encodeURIComponent(id)}` }).sessions.attach(id).snapshot({ signal: AbortSignal.timeout(10_000) });
  const status = async (lesson, id) => (await records(lesson)).find(record => record.id === id)?.lifecycle?.status;
  const before = await fetch(`${lessonUrl("first")}?prepare=false`).then(response => response.json());
  assert.equal(before.introduced, false);
  assert.equal(before.briefingBasePath, "lessons/first");

  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const frames = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("websocket", socket => socket.on("framereceived", frame => { try { frames.push(JSON.parse(String(frame.payload))); } catch {} }));
  const opencodeProcesses = () => execFileSync("ps", ["-axww", "-o", "pid=,command="], { encoding: "utf8" }).split("\n")
    .filter(line => line.includes(".harness-bootstrap/opencode")).map(line => Number(line.trim().split(/\s+/u)[0]));
  const foreignOpencode = new Set(opencodeProcesses());
  const route = `${origin}/session/${courses[0].runId}`;
  const chatPane = () => page.getByTestId("authoring-chat-pane");
  const composer = () => page.getByTestId("authoring-chat-composer").getByRole("textbox");
  const send = async text => {
    await expect(composer()).toBeEnabled({ timeout: 60_000 });
    if (scripted.some(entry => entry.prompt === text)) armed.add(text);
    await composer().fill(text);
    await composer().press("Enter");
  };
  const lessonPane = () => page.getByTestId("lesson-pane");
  const results = () => page.getByRole("region", { name: "Test results", exact: true });
  const label = text => chatPane().getByText(text, { exact: true });
  const editor = () => page.locator(".monaco-editor textarea");
  /** Check, and the observation the socket reports for it */
  const check = async () => {
    const started = frames.length;
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect.poll(() => {
      const failure = frames.slice(started).find(frame => frame.error);
      if (failure) throw new Error(JSON.stringify(failure.error));
      return Boolean(frames.slice(started).find(frame => frame.method === "lesson.check.completed"));
    }, { timeout: 60_000 }).toBe(true);
    return frames.slice(started).find(frame => frame.method === "lesson.check.completed").params.observation;
  };
  const replaceCode = async code => {
    await editor().focus();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.insertText(code);
  };

  // 1. The kata page opens lesson `first` and creates exactly one Sensei record for it; the begin turn is hidden and carries the lesson
  await page.goto(route);
  await expect(editor()).toBeVisible({ timeout: 30_000 });
  await expect(lessonPane()).toContainText("Count the tokens in a short sentence.");
  await expect.poll(async () => (await records("first")).length, { timeout: 60_000 }).toBe(1);
  const [first] = await records("first");
  failureEvents = () => snapshot(first.id);
  assert.equal(first.courseId, course);
  assert.equal(first.lessonId, "first");
  assert.equal(first.model, "openai/gpt-4o");
  await expect(chatPane()).toContainText("Ready to teach.", { timeout: 120_000 });
  const begin = carrying("Begin the lesson.");
  assert.ok(begin.length >= 1, "the begin turn reached no main-loop request");
  assert.ok(begin.some(request => JSON.stringify(request).includes("KATA-SOURCE-first")), "the begin turn's request lacks the lesson source");
  assert.ok(begin.some(request => JSON.stringify(request).includes("PRIVATE-GUIDANCE-KATA")), "the begin turn's request lacks the course guidance");
  await expect(chatPane()).not.toContainText("[dojo:begin]");
  await expect.poll(() => status("first", first.id), { timeout: 30_000 }).toBe("idle");
  await expect.poll(async () => (await fetch(`${lessonUrl("first")}?prepare=false`).then(response => response.json())).introduced, { timeout: 30_000 }).toBe(true);

  // The editor, hover, resource and layout checks of the ACP page, on the Eve page
  await expect(page.locator(".ui-ed .ui-ed__monaco")).toBeVisible();
  await expect(page.locator(".dojo-code-editor")).toHaveCount(0);
  assert.equal(await page.evaluate(async () => {
    const faces = await document.fonts.load('16px "Iosevka"');
    return faces.length > 0 && faces.every(face => face.status === "loaded");
  }), true, "The real editor font must load from the built app");
  await expect.poll(() => page.locator(".view-lines").evaluate(node => new Set([...node.querySelectorAll("span[class^=mtk]")].map(span => span.classList[0])).size),
    { message: "The real editor must apply syntax highlighting", timeout: 15_000 }).toBeGreaterThan(1);
  await page.locator(".view-lines").getByText("answer", { exact: true }).first().hover();
  const hover = page.locator(".monaco-hover:visible");
  await expect(hover).toContainText("Count the tokens in the fixture.");
  await expect(hover).toContainText("answer();");
  await page.getByRole("tab", { name: "kata.mjs", exact: true }).click();
  await expect(page.locator(".ui-as-app")).toHaveCSS("height", "1000px");
  await expect(page.locator(".ui-lb .shiki")).toHaveCount(1);
  const resources = page.locator(".ui-lb__section");
  if (!await resources.evaluate(node => node.open)) await resources.locator("summary").click();
  const reference = resources.getByRole("link", { name: /Fixture reference/ });
  await expect(reference).toBeVisible();
  const resourceResponse = await page.request.get(new URL(await reference.getAttribute("href"), origin).href);
  assert.equal(resourceResponse.status(), 200);
  assert.match(await resourceResponse.text(), /Actual installed lesson reference/);
  await composer().fill("Keep this unsent question");
  await page.getByRole("button", { name: "Hide chat", exact: true }).click();
  await expect(page.locator(".ui-as-app")).toHaveAttribute("data-aside-hidden", "");
  await page.getByRole("button", { name: "Show chat", exact: true }).click();
  await expect(composer()).toHaveValue("Keep this unsent question");
  await composer().fill("");
  await page.screenshot({ path: artifact("kata-desktop.png") });

  // 2. Reload keeps the session and sends no second begin; a learner message; the model switch; Stop; a question answered by text
  let count = endpoint.requests.length;
  await page.reload();
  await expect(chatPane()).toContainText("Ready to teach.", { timeout: 60_000 });
  await expect(composer()).toBeEnabled({ timeout: 60_000 });
  assert.deepEqual((await records("first")).map(record => record.id), [first.id]);
  assert.equal(endpoint.requests.length, count, "reopening the conversation must not create a model request");
  count = endpoint.requests.length;
  await send("Help me understand this lesson");
  await expect.poll(() => carrying("Help me understand this lesson", count).length, { timeout: 60_000 }).toBeGreaterThan(0);
  assert.ok(JSON.stringify(carrying("Help me understand this lesson", count).at(-1)).includes("Count the tokens"), "the turn's context lacks the lesson");
  await expect.poll(() => status("first", first.id), { timeout: 60_000 }).toBe("idle");
  await page.getByTestId("authoring-chat-composer").getByRole("button", { name: "Model", exact: true }).click();
  const patched = page.waitForResponse(response => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith(`/sessions/${first.id}`));
  await page.getByRole("menuitemradio", { name: "openai/gpt-4o-mini", exact: true }).click();
  assert.equal((await patched).status(), 200);
  await expect.poll(async () => (await records("first"))[0]?.revision).toBe(1);
  assert.equal(JSON.parse(await readFile(join(workspace, ".dojo/runtimes.json"), "utf8")).models.opencode, "openai/gpt-4o-mini");
  const cancelQuestion = "Hold this response until I stop it";
  const stopped = endpoint.holdNextResponse(request => JSON.stringify(request.input ?? []).includes(cancelQuestion));
  let connectionClosed = false;
  stopped.closed.then(() => { connectionClosed = true; });
  try {
    await send(cancelQuestion);
    await stopped.started;
    assert.equal(endpoint.requestedModels.at(-1), "gpt-4o-mini", "the next request must use the selected model");
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect.poll(() => connectionClosed, { timeout: 15_000 }).toBe(true);
  } finally { stopped.release(); }
  await expect.poll(async () => (await snapshot(first.id)).events.some(event => event.type === "turn.settled" && event.data.outcome === "cancelled"), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => status("first", first.id), { timeout: 30_000 }).toBe("idle");
  await expect.poll(() => opencodeProcesses().filter(pid => !foreignOpencode.has(pid)).length, { timeout: 10_000 }).toBe(0);
  count = endpoint.requests.length;
  await send(askPrompt);
  await expect(chatPane()).toContainText("Which example do you prefer?", { timeout: 60_000 });
  await expect.poll(() => status("first", first.id), { timeout: 30_000 }).toBe("paused");
  await send("the second one");
  await expect.poll(() => carrying("the second one", count).length, { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(() => status("first", first.id), { timeout: 60_000 }).toBe("idle");
  const approvals = (await snapshot(first.id)).events.filter(event => event.type === "interaction.opened" && ["approval", "budget"].includes(event.data?.request?.kind));
  assert.deepEqual(approvals, [], "an approval or budget prompt was opened");
  await expect(page.getByRole("button", { name: /^(Approve|Allow|Deny)$/u })).toHaveCount(0);

  // 3. A Check while Sensei is idle: the report goes now, and its delivery's consumption marks the card seen
  count = endpoint.requests.length;
  const failed = await check();
  assert.equal(failed.report.failed, 2);
  assert.equal(failed.attempt, 1);
  await page.getByRole("tab", { name: /Tests/ }).click();
  await expect(results().getByRole("img", { name: "Failed", exact: true })).toHaveCount(2, { timeout: 30_000 });
  await expect(results().getByRole("img", { name: "Skipped", exact: true })).toHaveCount(1);
  await expect(results()).toContainText("Count the tokens before checking again.");
  await expect.poll(() => carrying("Ran lesson checks.", count).length, { timeout: 60_000 }).toBeGreaterThan(0);
  assert.ok(JSON.stringify(carrying("Ran lesson checks.", count)[0]).includes('\\"attempt\\":1'), "the report's request lacks the observation");
  await expect(label("Sensei saw this")).toHaveCount(1, { timeout: 60_000 });
  await expect.poll(() => status("first", first.id), { timeout: 60_000 }).toBe("idle");

  // 4. A Check while Sensei's question is open is held, and goes once the answer settles the turn
  await send(askPrompt);
  await expect.poll(() => status("first", first.id), { timeout: 60_000 }).toBe("paused");
  count = endpoint.requests.length;
  await check();
  await expect(label("Sensei will see this after it finishes")).toHaveCount(1, { timeout: 30_000 });
  assert.equal(carrying("Ran lesson checks.", count).length, 0, "a held report must wait for the turn");
  await send("the first one");
  await expect.poll(() => carrying("Ran lesson checks.", count).length, { timeout: 90_000 }).toBeGreaterThan(0);
  await expect(label("Sensei saw this")).toHaveCount(2, { timeout: 60_000 });
  await expect.poll(() => status("first", first.id), { timeout: 60_000 }).toBe("idle");

  // 5. A save drops a held report: Sensei never gets it
  const saveHold = endpoint.holdNextResponse(request => JSON.stringify(request.input ?? []).includes("Hold this turn for the save check"));
  try {
    await send("Hold this turn for the save check");
    await saveHold.started;
    const held = await check();
    await expect(label("Sensei will see this after it finishes")).toHaveCount(1, { timeout: 30_000 });
    await page.getByRole("tab", { name: "kata.mjs", exact: true }).click();
    await editor().focus();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("\n// A change after the check\n");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(label("Sensei hasn't seen this; press Check again or ask")).toHaveCount(1, { timeout: 30_000 });
    count = endpoint.requests.length;
    saveHold.release();
    await expect.poll(() => status("first", first.id), { timeout: 60_000 }).toBe("idle");
    await new Promise(resolve => setTimeout(resolve, 2_000));
    assert.ok(!endpoint.requests.slice(count).some(request => JSON.stringify(request).includes(held.id)), "a dropped report reached the model");
  } finally { saveHold.release(); }

  // 6. The guard: a native write during a working turn is restored, the other version is quarantined, the check result cleared
  const solutionPath = join(workspace, before.filePath);
  const beforeTurn = await readFile(solutionPath, "utf8");
  const guardHold = endpoint.holdNextResponse(request => JSON.stringify(request.input ?? []).includes("Hold this turn for the guard check"));
  try {
    await send("Hold this turn for the guard check");
    await guardHold.started;
    await writeFile(solutionPath, "export const answer = () => 'written natively';\n");
  } finally { guardHold.release(); }
  const notice = page.getByTestId("guard-notice");
  await expect(notice).toContainText("The file changed while Sensei was working. Dojofoo restored the version from before Sensei's turn.", { timeout: 60_000 });
  const quarantined = /The other version is at (\/.+?)\.(?:Use the restored file|Dismiss)/u.exec(await notice.textContent())?.[1];
  assert.ok(quarantined, "the notice names the quarantine path");
  assert.equal(await readFile(solutionPath, "utf8"), beforeTurn, "the guard restores the version from before the turn");
  assert.equal(await readFile(quarantined, "utf8"), "export const answer = () => 'written natively';\n");
  await expect(page.getByRole("img", { name: "Tests not run", exact: true })).toBeVisible();
  assert.equal((await fetch(`${lessonUrl("first")}?prepare=false`).then(response => response.json())).result, null);
  await notice.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect.poll(() => status("first", first.id), { timeout: 60_000 }).toBe("idle");

  // 8. Completion: the solved lesson's checks pass, Sensei's completion question, and Move on opens `next`
  await page.getByRole("tab", { name: "kata.mjs", exact: true }).click();
  await replaceCode("export function answer() { return 42; }\n");
  const passed = await check();
  assert.equal(passed.report.complete, true);
  await page.getByRole("tab", { name: /Tests/ }).click();
  await expect(results().getByRole("img", { name: "Passed", exact: true })).toHaveCount(3, { timeout: 30_000 });
  await expect.poll(() => status("first", first.id), { timeout: 60_000 }).toBe("idle");
  count = endpoint.requests.length;
  await send(completePrompt);
  await expect(chatPane()).toContainText("What would you like to do next?", { timeout: 60_000 });
  assert.ok(endpoint.requestedTools.some(name => name.endsWith("dojo_lesson_complete")), "the loopback never called dojo_lesson_complete");
  await chatPane().getByRole("radio", { name: /Move on/u }).click();
  await expect(lessonPane()).toContainText("Read the next goal without starting another lesson.", { timeout: 60_000 });
  await expect.poll(async () => (await records("next")).length, { timeout: 60_000 }).toBe(1);
  const [next] = await records("next");
  await expect.poll(() => carrying("Begin the lesson.", count).some(request => JSON.stringify(request).includes("KATA-SOURCE-next")), { timeout: 120_000 }).toBe(true);
  const rc = readDojoRc(workspace);
  assert.equal(rc.currentDojo, course);
  assert.ok(rc.progress[course].completed.includes("first"));
  assert.equal(rc.progress[course].lastActive, "next");

  // 7. Leaving: a question open on `next`; opening `first` leaves `next` at once and cancels its paused turn; back on `next`, the question
  //    is no longer open and a message continues the same conversation. The left lesson is the one Move on opened: the page links only
  //    a lesson that is current or completed (step-5 plan, decision on check 7's order)
  await expect.poll(() => status("next", next.id), { timeout: 120_000 }).toBe("idle");
  await send(askPrompt);
  await expect.poll(() => status("next", next.id), { timeout: 60_000 }).toBe("paused");
  await page.getByRole("button", { name: /^First \(done\)/u }).click();
  await expect(lessonPane()).toContainText("Count the tokens in a short sentence.", { timeout: 30_000 });
  await expect.poll(() => status("next", next.id), { timeout: 10_000 }).toBe("idle");
  assert.ok((await snapshot(next.id)).events.some(event => event.type === "turn.settled" && event.data.outcome === "cancelled"), "the left lesson's turn was not cancelled");
  assert.deepEqual((await records("first")).map(record => record.id), [first.id], "returning to a lesson reuses its conversation");
  await page.getByRole("button", { name: /^Next \(/u }).click();
  await expect(lessonPane()).toContainText("Read the next goal without starting another lesson.", { timeout: 30_000 });
  await expect(chatPane()).toContainText("Which example do you prefer?", { timeout: 60_000 });
  assert.ok((await snapshot(next.id)).events.some(event => event.type === "interaction.settled"), "the left question is still open");
  count = endpoint.requests.length;
  await send("Let's continue this lesson");
  await expect.poll(() => carrying("Let's continue this lesson", count).length, { timeout: 60_000 }).toBeGreaterThan(0);
  assert.deepEqual((await records("next")).map(record => record.id), [next.id]);
  await expect.poll(() => status("next", next.id), { timeout: 60_000 }).toBe("idle");

  // A server restart reopens the same session with its transcript
  await stopServer();
  server = launchServer();
  await ready();
  await page.goto(route);
  await expect(chatPane()).toContainText("Let's continue this lesson", { timeout: 60_000 });
  await expect(composer()).toBeEnabled({ timeout: 60_000 });
  assert.deepEqual((await records("next")).map(record => record.id), [next.id]);

  // 9. The course source is unchanged; no tag, private guidance or lesson source in the visible chat; no page errors
  assert.deepEqual(await sourceFiles(), sourceBefore);
  for (const hidden of ["[dojo:", "PRIVATE-GUIDANCE-", "KATA-SOURCE-"]) await expect(chatPane()).not.toContainText(hidden);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".ui-as-app")).toHaveAttribute("data-narrow", "true");
  await page.screenshot({ path: artifact("kata-mobile.png") });
  assert.deepEqual(errors, []);
  await writeFile(artifact("native-requests.json"), JSON.stringify(endpoint.requests, null, 2));
  console.log("Real CLI/kata browser on Eve: hidden begin turns with the lesson source and course guidance, the editor and resources, reload, a learner message, model switch, Stop, a question answered by text, check reports sent, held and dropped, the write guard, completion with Move on, leaving and server-restart restoration passed.");
} catch (error) {
  console.error(output);
  if (failureEvents) {
    const events = await failureEvents().then(({ events }) => events, reason => [{ type: "snapshot failed", data: String(reason) }]);
    await writeFile(artifact("session-events.json"), JSON.stringify(events.map(event => [event.type, event.data]), null, 2));
  }
  const logs = join(scratch, "data/opencode/log");
  const tails = await readdir(logs).then(names => Promise.all(names.map(async name => `== ${name}\n${(await readFile(join(logs, name), "utf8")).split("\n").slice(-200).join("\n")}`)), () => []);
  await writeFile(artifact("opencode-log-tail.txt"), tails.join("\n"));
  await writeFile(artifact("native-requests.json"), JSON.stringify(endpoint.requests, null, 2));
  if (page) { await page.screenshot({ path: artifact("failure.png") }).catch(() => {}); await writeFile(artifact("failure.html"), await page.content().catch(() => "")); }
  throw error;
} finally {
  await browser?.close();
  await stopServer();
  await endpoint.close();
  // A native process the server's stop is still reaping can write into the scratch directory for a moment
  await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(error => console.warn(`Could not remove ${scratch}: ${error.message}`));
}

async function stopServer() {
  if (!server?.pid || server.exitCode !== null || server.signalCode !== null) return;
  const child = server;
  const group = child.pid;
  const closed = once(child, "close");
  const kill = signal => {
    try { if (process.platform === "win32") child.kill(signal); else process.kill(-group, signal); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  const timer = setTimeout(() => kill("SIGKILL"), 5_000);
  try { kill("SIGTERM"); await closed; }
  finally {
    clearTimeout(timer);
    if (process.platform !== "win32") {
      const members = execFileSync("ps", ["-axo", "pid=,pgid="], { encoding: "utf8" }).trim().split("\n")
        .map(line => line.trim().split(/\s+/).map(Number)).filter(([, id]) => id === group);
      for (const [pid] of members) { try { process.kill(pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; } }
    }
  }
}
