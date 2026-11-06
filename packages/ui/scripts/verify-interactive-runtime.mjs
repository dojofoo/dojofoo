import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Built CLI, actual installed courses, interactive Sensei on Eve through the native OpenCode harness. Inference is local and scripted.
const repo = fileURLToPath(new URL("../../..", import.meta.url));
const evidence = await mkdtemp(join(tmpdir(), "dojo-interactive-runtime-evidence-"));
const scratch = await mkdtemp(join(tmpdir(), "dojo-interactive-runtime-"));
const artifact = name => join(evidence, name);
console.log(`Interactive runtime evidence: ${evidence}`);
const { startLoopbackModel } = await import(pathToFileURL(join(repo, "packages/harness/experiments/model-provider/loopback-openai.mjs")));
const { observeLocalContext } = await import(pathToFileURL(join(repo, "packages/config/dist/local-state.js")));
const { Client } = await import(pathToFileURL(join(repo, "packages/harness/dist/eve/dist/src/client/index.js")));
// Only "Ask me which example I prefer." asks the learner; every other prompt gets "Ready to teach."
const askPrompt = "Ask me which example I prefer.";
const endpoint = await startLoopbackModel({ selectResponsesTool: (input, requested) => {
  const items = Array.isArray(input.input) ? input.input : [];
  const asked = items.findLastIndex(item => item.role === "user" && JSON.stringify(item.content ?? "").includes(askPrompt));
  if (asked < 0 || asked !== items.findLastIndex(item => item.role === "user")) return undefined;
  if (items.slice(asked).some(item => item.type === "function_call_output")) return undefined;
  const tool = (input.tools ?? []).find(candidate => candidate.name?.endsWith("ask_question"));
  return tool && requested.filter(name => name === tool.name).length < 1 ? { name: tool.name, input: { question: "Which example do you prefer?" } } : undefined;
} });
const stateHome = join(scratch, "state");
const workspace = join(scratch, "workspace");
const cli = join(repo, "packages/cli/dist/index.js");
// Model discovery runs `$OPENCODE_BIN models`. OpenCode 2 answers it from a managed service, which on a developer's machine is
// their own; a fixed catalog keeps the composer's menu the same everywhere. The conversation itself runs the adapter's own OpenCode.
const discovery = join(scratch, "bin/opencode");
await mkdir(join(scratch, "bin"), { recursive: true });
await writeFile(discovery, '#!/bin/sh\n[ "$1" = models ] && printf "openai/gpt-4o\\nopenai/gpt-4o-mini\\n" && exit 0\nexit 1\n', { mode: 0o755 });
// OpenCode reads the OpenAI variables, as in tier A's host child; the adapter writes its own config
const environment = { ...process.env, DOJOFOO_HOME: stateHome, DO_NOT_TRACK: "1", OPENCODE_BIN: discovery,
  XDG_CONFIG_HOME: join(scratch, "config"), XDG_DATA_HOME: join(scratch, "data"), XDG_CACHE_HOME: join(scratch, "cache"),
  OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: endpoint.baseURL, AI_GATEWAY_API_KEY: "", VERCEL_OIDC_TOKEN: "", NODE_PATH: undefined, CI: "", TEST: "" };
delete environment.OPENCODE_CONFIG_CONTENT;
let server;
// Reads the Sensei session's events for a failure's evidence, once the page has opened it
let failureEvents;
let output = "";
let browser;
let page;
/** Main-loop requests (those offering tools) whose JSON contains `text` */
const carrying = (text, from = 0) => endpoint.requests.slice(from).filter((request, index) => endpoint.toolLists[from + index]?.length && JSON.stringify(request).includes(text));
try {
  await mkdir(workspace, { recursive: true });
  for (const name of ["first", "second"]) {
    const source = join(scratch, name);
    await mkdir(join(source, "lessons"), { recursive: true });
    await writeFile(join(source, "dojo.json"), JSON.stringify({ mode: "interactive", name, version: "0.0.1", description: `Learn ${name}`, lessons: "lesson.json" }));
    await writeFile(join(source, "lesson.json"), JSON.stringify({ id: "intro", title: `Learn ${name}`, steps: [
      { id: "read", type: "present", title: `Read ${name}`, content: "lessons/read.mdx" },
      { id: "answer", type: "question", title: "Find resources", prompt: "Which view has the lesson resources?", answers: ["resources"], explanation: "Open Resources for the authored links." },
      { id: "finish", type: "present", title: `Finish ${name}`, content: `You practiced the ${name} course.` },
    ] }));
    await writeFile(join(source, "lessons/read.mdx"), `# Material from ${name}\n\n[Reference](reference.svg)\n\n\`\`\`js\nconst course = "${name}";\n\`\`\`\n`);
    await writeFile(join(source, "lessons/reference.svg"), `<svg xmlns="http://www.w3.org/2000/svg"><text>${name}</text></svg>`);
    await writeFile(join(source, "DOJO.md"), `PRIVATE-GUIDANCE-${name}: Teach this course from its own authored notes.\n`);
    execFileSync(process.execPath, [cli, "add", source], { cwd: workspace, env: environment, stdio: "pipe", timeout: 30_000 });
  }
  // The workspace's coding agent and its last model, as the composer's menus save them
  await mkdir(join(workspace, ".dojo"), { recursive: true });
  await writeFile(join(workspace, ".dojo/runtimes.json"), JSON.stringify({ agent: "opencode", models: { opencode: "openai/gpt-4o" } }));
  const sourceBefore = await readFile(join(scratch, "first/lesson.json"), "utf8");
  observeLocalContext(workspace, { stateHome });
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const launch = () => {
    const child = spawn(process.execPath, [cli, "ui", "--no-open", "--no-portless", "--port", String(port)], {
      cwd: workspace, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
      env: { ...environment, DOJO_PROJECT_ROOT: workspace, HOST: "127.0.0.1" },
    });
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    return child;
  };
  server = launch();
  const { chromium, expect } = await import(pathToFileURL(join(repo, "packages/ui/node_modules/@playwright/test/index.mjs")));
  const ready = () => expect.poll(async () => { try { return (await fetch(`${origin}/api/control/courses`)).status; } catch { return 0; } }, { timeout: 30_000 }).toBe(200);
  await ready();
  const courses = await fetch(`${origin}/api/control/courses`).then(response => response.json());
  assert.equal(courses.length, 2, "the library lists both installed courses");
  const workspaceId = courses.find(course => course.dojo === "first").workspaceId;
  const agentApi = `${origin}/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;
  const base = `${origin}/api/workspaces/${encodeURIComponent(workspaceId)}/courses/first/interactive`;
  assert.equal((await fetch(base).then(response => response.json())).dojo, "first");
  const records = async () => (await fetch(`${agentApi}/sessions?persona=sensei`).then(response => response.json())).data;
  const snapshot = id => new Client({ baseUrl: `${agentApi}/sessions/${encodeURIComponent(id)}` }).sessions.attach(id).snapshot({ signal: AbortSignal.timeout(10_000) });
  if (process.argv.includes("--context-only")) {
    const { token } = await fetch(`${origin}/api/control/launch-token`, { headers: { origin } }).then(response => response.json());
    for (const name of ["first", "second"]) {
      const opened = await fetch(`${agentApi}/sessions/default`, { method: "POST", headers: { "content-type": "application/json", "x-dojofoo-launch-token": token, origin },
        body: JSON.stringify({ course: name }) }).then(response => response.json());
      const id = opened.session.id;
      const before = endpoint.requests.length;
      const question = `Help me understand the ${name} guidance.`;
      const delivery = await new Client({ baseUrl: `${agentApi}/sessions/${encodeURIComponent(id)}` }).sessions.attach(id).send(question);
      assert.match(JSON.stringify(await delivery.result({ signal: AbortSignal.timeout(120_000) })), /Ready to teach/);
      const request = carrying(question, before).at(-1);
      assert.ok(request, `No native model request for ${name}`);
      assert.ok(JSON.stringify(request).includes(`PRIVATE-GUIDANCE-${name}`));
      assert.ok(JSON.stringify(request).includes(`Material from ${name}`));
      assert.ok(!JSON.stringify(request).includes(`PRIVATE-GUIDANCE-${name === "first" ? "second" : "first"}`));
    }
    await writeFile(artifact("native-requests.json"), JSON.stringify(endpoint.requests, null, 2));
    console.log("Native course context on Eve: each course's guidance reached its own Sensei conversation, never the other's.");
  } else {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const route = `${origin}/learn/${courses.find(course => course.dojo === "first").runId}`;
  const opencodeProcesses = () => execFileSync("ps", ["-axww", "-o", "pid=,command="], { encoding: "utf8" }).split("\n")
    .filter(line => line.includes(".harness-bootstrap/opencode")).map(line => Number(line.trim().split(/\s+/u)[0]));
  const foreignOpencode = new Set(opencodeProcesses());
  const chatPane = () => page.getByTestId("authoring-chat-pane");
  const composer = () => page.getByTestId("authoring-chat-composer").getByRole("textbox");
  const send = async text => { await expect(composer()).toBeEnabled({ timeout: 60_000 }); await composer().fill(text); await composer().press("Enter"); };

  // 1. Opening the course creates exactly one Sensei record for it, with the workspace's last model
  await page.goto(route);
  const material = page.getByTestId("interactive-material");
  await expect(material).toContainText("Material from first");
  await expect(material.locator(".shiki")).toContainText('const course = "first"');
  const reference = material.getByRole("link", { name: "Reference", exact: true }).first();
  const href = await reference.getAttribute("href");
  assert.ok(href.includes("course=first"));
  assert.match(await fetch(new URL(href, origin)).then(response => response.text()), /first/);
  await expect.poll(async () => (await records()).length, { timeout: 60_000 }).toBe(1);
  const [initial] = await records();
  failureEvents = () => snapshot(initial.id);
  assert.equal(initial.courseId, "first");
  assert.equal(initial.model, "openai/gpt-4o");

  // 2. The begin turn reaches the model with the course's guidance, and the chat hides it
  await expect(chatPane()).toContainText("Ready to teach.", { timeout: 120_000 });
  const begin = carrying("Begin the lesson.");
  assert.ok(begin.length >= 1, "the begin turn reached no main-loop request");
  assert.ok(begin.some(request => JSON.stringify(request).includes("PRIVATE-GUIDANCE-first")), "the begin turn's request lacks the course guidance");
  await expect(chatPane()).not.toContainText("Begin the lesson.");
  await expect(chatPane()).not.toContainText("[dojo:begin]");
  await expect.poll(async () => (await records())[0]?.lifecycle?.status, { timeout: 30_000 }).toBe("idle");

  // 3. A reload opens the same session and sends no second begin request
  const beforeReload = endpoint.requests.length;
  await page.reload();
  await expect(chatPane()).toContainText("Ready to teach.", { timeout: 60_000 });
  await expect(composer()).toBeEnabled({ timeout: 60_000 });
  assert.deepEqual((await records()).map(record => record.id), [initial.id]);
  assert.equal(endpoint.requests.length, beforeReload, "reopening the conversation must not create a model request");

  // 4. A learner message is grounded in its own course only
  let count = endpoint.requests.length;
  await send("Help me understand the first material");
  await expect.poll(() => carrying("Help me understand the first material", count).length, { timeout: 60_000 }).toBeGreaterThan(0);
  const learner = carrying("Help me understand the first material", count).at(-1);
  assert.ok(JSON.stringify(learner).includes("PRIVATE-GUIDANCE-first"));
  assert.ok(JSON.stringify(learner).includes("Material from first"));
  assert.ok(!JSON.stringify(learner).includes("PRIVATE-GUIDANCE-second"));
  await expect.poll(async () => (await records())[0]?.lifecycle?.status, { timeout: 60_000 }).toBe("idle");

  // 5. The per-turn context carries the saved answer
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(material).toContainText("Which view has the lesson resources?");
  assert.equal((await fetch(base.replace(/interactive$/, "lessons/answer/progressions"), { method: "POST" })).status, 409);
  await page.getByRole("textbox", { name: "Your answer", exact: true }).fill("sidebar");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(material).toContainText("Not quite: sidebar");
  count = endpoint.requests.length;
  await send("Explain what I missed in this step");
  await expect.poll(() => carrying("Explain what I missed in this step", count).length, { timeout: 60_000 }).toBeGreaterThan(0);
  assert.ok(carrying("Explain what I missed in this step", count).some(request => JSON.stringify(request).includes('\\"answer\\":\\"sidebar\\"')),
    "the turn's request lacks the saved answer");
  await expect.poll(async () => (await records())[0]?.lifecycle?.status, { timeout: 60_000 }).toBe("idle");

  // 6. Model switch: from the next turn, kept as the workspace's last model for OpenCode
  await page.getByTestId("authoring-chat-composer").getByRole("button", { name: "Model", exact: true }).click();
  const patched = page.waitForResponse(response => response.request().method() === "PATCH" && new URL(response.url()).pathname.endsWith(`/sessions/${initial.id}`));
  await page.getByRole("menuitemradio", { name: "openai/gpt-4o-mini", exact: true }).click();
  assert.equal((await patched).status(), 200);
  await expect.poll(async () => (await records())[0]?.revision).toBe(1);
  assert.equal((await records())[0].model, "openai/gpt-4o-mini");
  assert.equal(JSON.parse(await readFile(join(workspace, ".dojo/runtimes.json"), "utf8")).models.opencode, "openai/gpt-4o-mini");

  // 7. Cancel: the held request's connection closes, the turn settles cancelled and the native processes go
  const cancelQuestion = "Hold this response until I stop it";
  const held = endpoint.holdNextResponse(request => JSON.stringify(request.input ?? []).includes(cancelQuestion));
  let connectionClosed = false;
  held.closed.then(() => { connectionClosed = true; });
  try {
    await send(cancelQuestion);
    await held.started;
    assert.equal(endpoint.requestedModels.at(-1), "gpt-4o-mini", "the next actual request must use the selected model");
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect.poll(() => connectionClosed, { timeout: 15_000 }).toBe(true);
  } finally { held.release(); }
  await expect.poll(async () => (await snapshot(initial.id)).events.some(event => event.type === "turn.settled" && event.data.outcome === "cancelled"), { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await records())[0]?.lifecycle?.status, { timeout: 30_000 }).toBe("idle");
  // Only this run's native processes: other OpenCode bridges on the machine were running before it
  await expect.poll(() => opencodeProcesses().filter(pid => !foreignOpencode.has(pid)).length, { timeout: 10_000 }).toBe(0);

  // 8. Sensei's question is answered by text in the composer
  count = endpoint.requests.length;
  await send(askPrompt);
  await expect(chatPane()).toContainText("Which example do you prefer?", { timeout: 60_000 });
  await expect.poll(async () => (await records())[0]?.lifecycle?.status, { timeout: 30_000 }).toBe("paused");
  await send("the second one");
  await expect.poll(() => carrying("the second one", count).length, { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await records())[0]?.lifecycle?.status, { timeout: 60_000 }).toBe("idle");
  await expect(chatPane()).toContainText("Ready to teach.");

  // 9. No approval or budget prompt reached the learner
  const events = (await snapshot(initial.id)).events;
  assert.ok(!events.some(event => event.type === "interaction.opened" && ["approval", "budget"].includes(event.data?.request?.kind)), "an approval or budget prompt was opened");
  await expect(page.getByRole("button", { name: /^(Approve|Allow|Deny)$/u })).toHaveCount(0);

  // Progress continues as before
  await page.getByRole("textbox", { name: "Your answer", exact: true }).fill("resources");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(material).toContainText("Correct: resources");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(material).toContainText("You practiced the first course.");
  await page.screenshot({ path: artifact("interactive-desktop.png") });

  // 10. A server restart opens the same session, with its model and its transcript, the begin turn still hidden
  await stopServer();
  server = launch();
  await ready();
  await page.goto(route);
  await expect(material).toContainText("You practiced the first course.");
  await expect(chatPane()).toContainText("Explain what I missed", { timeout: 60_000 });
  await expect(chatPane()).not.toContainText("[dojo:begin]");
  await expect(composer()).toBeEnabled({ timeout: 60_000 });
  const restored = await records();
  assert.deepEqual(restored.map(record => record.id), [initial.id]);
  assert.equal(restored[0].model, "openai/gpt-4o-mini");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".ui-as-app")).toHaveAttribute("data-narrow", "true");
  await expect.poll(() => page.locator(".ui-as-side").evaluate(node => node.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  await expect(material).toBeVisible();
  await page.screenshot({ path: artifact("interactive-mobile.png") });

  // 11. The second course opens its own session with its own begin turn; the first reopens its own
  await page.setViewportSize({ width: 1440, height: 1000 });
  count = endpoint.requests.length;
  await page.goto(`${origin}/learn/${courses.find(course => course.dojo === "second").runId}`);
  await expect(material).toContainText("Material from second");
  await expect.poll(async () => (await records()).filter(record => record.courseId === "second").length, { timeout: 60_000 }).toBe(1);
  const second = (await records()).find(record => record.courseId === "second");
  assert.notEqual(second.id, initial.id);
  await expect.poll(() => carrying("Begin the lesson.", count).some(request => JSON.stringify(request).includes("PRIVATE-GUIDANCE-second")), { timeout: 120_000 }).toBe(true);
  assert.ok(!carrying("Begin the lesson.", count).some(request => JSON.stringify(request).includes("PRIVATE-GUIDANCE-first")));
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("textbox", { name: "Your answer", exact: true }).fill("resources");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(material).toContainText("Correct: resources");
  assert.equal((await fetch(base).then(response => response.json())).current.id, "finish");
  await page.goto(route);
  await expect(material).toContainText("You practiced the first course.");
  await expect(chatPane()).toContainText("Help me understand the first material", { timeout: 60_000 });
  assert.equal((await records()).filter(record => record.courseId === "first").length, 1);

  // 12. The course source is unchanged, private guidance never shows, and the page logged no errors
  assert.equal(await readFile(join(scratch, "first/lesson.json"), "utf8"), sourceBefore);
  await expect(chatPane()).not.toContainText("PRIVATE-GUIDANCE-");
  assert.deepEqual(errors, []);
  await writeFile(artifact("native-requests.json"), JSON.stringify(endpoint.requests, null, 2));
  console.log("Real CLI/interactive browser on Eve: two installed courses, hidden begin turns, grounded replies with per-turn context, model switch, cancel, a question answered by text, no approval prompt, progress and server-restart restoration passed.");
  }
} catch (error) {
  console.error(output);
  // The session's events and the tail of OpenCode's own log (the learner's XDG data home) beside the requests
  if (failureEvents) {
    const events = await failureEvents().then(({ events }) => events, reason => [{ type: "snapshot failed", data: String(reason) }]);
    await writeFile(artifact("session-events.json"), JSON.stringify(events.map(event => [event.type, event.data]), null, 2));
  }
  const logs = join(scratch, "data/opencode/log");
  const tails = await readdir(logs).then(names => Promise.all(names.map(async name => `== ${name}\n${(await readFile(join(logs, name), "utf8")).split("\n").slice(-200).join("\n")}`)), () => []);
  await writeFile(artifact("opencode-log-tail.txt"), tails.join("\n"));
  await writeFile(artifact("native-requests.json"), JSON.stringify(endpoint.requests, null, 2));
  if (page) { await page.screenshot({ path: artifact("failure.png") }); await writeFile(artifact("failure.html"), await page.content()); }
  throw error;
} finally {
  await browser?.close();
  await stopServer();
  await endpoint.close();
  await rm(scratch, { recursive: true, force: true });
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
