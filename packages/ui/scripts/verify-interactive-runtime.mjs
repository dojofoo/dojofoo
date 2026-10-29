import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Built CLI and actual installed courses/native ACP. Inference is local and scripted.
const repo = fileURLToPath(new URL("../../..", import.meta.url));
const evidence = await mkdtemp(join(tmpdir(), "dojo-interactive-runtime-evidence-"));
const scratch = await mkdtemp(join(tmpdir(), "dojo-interactive-runtime-"));
const artifact = name => join(evidence, name);
console.log(`Interactive runtime evidence: ${evidence}`);
const { startLoopbackModel } = await import(pathToFileURL(join(repo, "packages/agent/experiments/model-provider/loopback-openai.mjs")));
const { opencodeExecutable } = await import(pathToFileURL(join(repo, "packages/ui/src/server/harness/opencode.ts")));
const { observeLocalContext } = await import(pathToFileURL(join(repo, "packages/config/dist/local-state.js")));
const endpoint = await startLoopbackModel();
const stateHome = join(scratch, "state");
const workspace = join(scratch, "workspace");
const cli = join(repo, "packages/cli/dist/index.js");
const environment = { ...process.env, DOJOFOO_HOME: stateHome, DO_NOT_TRACK: "1", DOJOFOO_HARNESS: "opencode", OPENCODE_BIN: opencodeExecutable(),
  XDG_CONFIG_HOME: join(scratch, "config"), XDG_DATA_HOME: join(scratch, "data"), XDG_CACHE_HOME: join(scratch, "cache"),
  OPENCODE_CONFIG_CONTENT: JSON.stringify({ compaction: { auto: false }, model: "openai/gpt-4o", small_model: "openai/gpt-4o", enabled_providers: ["openai"],
    provider: { openai: { options: { baseURL: endpoint.baseURL, apiKey: "fixture-only" } } } }),
  DOJOFOO_MODEL: "", DOJOFOO_AUTHORING_MODEL: "", DOJOFOO_LESSON_MODEL: "", EVE_BASE_URL: "", DOJO_EVE_ROOT: "",
  OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: endpoint.baseURL, AI_GATEWAY_API_KEY: "", VERCEL_OIDC_TOKEN: "", NODE_PATH: undefined, CI: "", TEST: "" };
let server;
let output = "";
let browser;
let page;
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
  assert.equal(courses.length, 1, "the existing library lists the workspace's active course");
  const workspaceId = courses[0].workspaceId;
  const base = `${origin}/api/workspaces/${encodeURIComponent(workspaceId)}/courses/first/interactive`;
  assert.equal((await fetch(base).then(response => response.json())).dojo, "first");
  if (process.argv.includes("--context-only")) {
    const { ChatClient, fetchServerSentEvents } = await import(pathToFileURL(join(repo, "packages/ui/node_modules/@tanstack/ai-client/dist/esm/index.js")));
    for (const name of ["first", "second"]) {
      const selected = base.replace("/first/", `/${name}/`);
      const chat = new ChatClient({ connection: fetchServerSentEvents(`${selected}/messages`), threadId: name, persistence: false });
      try {
        const before = endpoint.requests.length;
        const question = `Help me understand the ${name} guidance.`;
        await chat.sendMessage(question);
        assert.match(JSON.stringify(chat.getMessages()), /Ready to teach/);
        const request = endpoint.requests.slice(before).find(request => JSON.stringify(request).includes(question));
        assert.ok(request, `No native model request for ${name}`);
        assert.ok(JSON.stringify(request).includes(`PRIVATE-GUIDANCE-${name}`));
        assert.ok(JSON.stringify(request).includes(`Material from ${name}`));
        assert.ok(!JSON.stringify(request).includes(`PRIVATE-GUIDANCE-${name === "first" ? "second" : "first"}`));
        const conversation = await fetch(`${selected}/conversation`).then(response => response.json());
        assert.ok(!JSON.stringify(conversation.messages).includes("PRIVATE-GUIDANCE-"), "Private teaching guidance leaked into learner chat");
      } finally { chat.dispose(); }
    }
    await writeFile(artifact("native-requests.json"), JSON.stringify(endpoint.requests, null, 2));
    console.log("Native course context: selected guidance reached both agents without cross-course or learner-transcript leakage.");
  } else {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const route = `${origin}/interactive?workspace=${encodeURIComponent(workspaceId)}&course=first`;
  await page.goto(route);
  const material = page.getByTestId("interactive-material");
  await expect(material).toContainText("Material from first");
  await expect(material.locator(".shiki")).toContainText('const course = "first"');
  const reference = material.getByRole("link", { name: "Reference", exact: true }).first();
  const href = await reference.getAttribute("href");
  assert.ok(href.includes("course=first"));
  assert.match(await fetch(new URL(href, origin)).then(response => response.text()), /first/);
  const composer = page.getByRole("textbox", { name: "Message the sensei", exact: true });
  await expect(composer).toBeEnabled();
  assert.equal(endpoint.requests.length, 0, "reading must not create a model request");
  await composer.fill("Help me understand the first material");
  await composer.press("Enter");
  await expect(page.getByTestId("chat-pane")).toContainText("Ready to teach.", { timeout: 30_000 });
  await expect(page.getByTestId("chat-pane")).toHaveAttribute("data-chat-status", "ready");
  const initial = await fetch(`${base}/conversation`).then(response => response.json());
  assert.ok(initial.sessionId);
  assert.ok(endpoint.requests.some(request => JSON.stringify(request.input).includes("Material from first")));
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(material).toContainText("Which view has the lesson resources?");
  assert.equal((await fetch(base.replace(/interactive$/, "lessons/answer/progressions"), { method: "POST" })).status, 409);
  await page.getByRole("textbox", { name: "Your answer", exact: true }).fill("sidebar");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(material).toContainText("Not quite: sidebar");
  const count = endpoint.requests.length;
  await composer.fill("Explain what I missed in this step");
  await composer.press("Enter");
  await expect.poll(() => endpoint.requests.length).toBeGreaterThan(count);
  await expect(page.getByTestId("chat-pane")).toHaveAttribute("data-chat-status", "ready");
  assert.ok(endpoint.requests.slice(count).some(request => JSON.stringify(request.input).includes('\\"answer\\":\\"sidebar\\"')));
  const choice = initial.model.options.find(option => option.value === "openai/gpt-4o-mini");
  assert.ok(choice);
  await page.getByRole("button", { name: "Model", exact: true }).click();
  await page.getByRole("menuitemradio", { name: new RegExp(choice.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  await expect.poll(async () => (await fetch(`${base}/conversation`).then(response => response.json())).model.currentValue).toBe(choice.value);
  const cancelQuestion = "Hold this response until I stop it";
  const held = endpoint.holdNextResponse(request => JSON.stringify(request.input ?? []).includes(cancelQuestion));
  let connectionClosed = false;
  held.closed.then(() => { connectionClosed = true; });
  try {
    await composer.fill(cancelQuestion);
    await composer.press("Enter");
    await expect.poll(() => endpoint.requests.some(request => JSON.stringify(request.input ?? []).includes(cancelQuestion)), { timeout: 15_000 }).toBe(true);
    await held.started;
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect.poll(() => connectionClosed, { timeout: 10_000 }).toBe(true);
    await expect(page.getByTestId("chat-pane")).toHaveAttribute("data-chat-status", "ready");
  } finally { held.release(); }
  assert.equal(endpoint.requestedModels.at(-1), "gpt-4o-mini", "the next actual request must use the selected model");
  await page.reload();
  await expect(material).toContainText("Not quite: sidebar");
  await expect(page.getByTestId("chat-pane")).toContainText("Help me understand the first material");
  await expect(composer).toBeEnabled();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(material).toContainText("You practiced the first course.");
  await expect.poll(() => page.getByTestId("sensei-streaming-message").first().evaluate(node => Number(getComputedStyle(node).opacity))).toBe(1);
  await expect(page.getByTestId("sensei-streaming-message").first()).toContainText("Ready to teach.");
  await page.screenshot({ path: artifact("interactive-desktop.png") });
  await stopServer();
  server = launch();
  await ready();
  await page.goto(route);
  await expect(material).toContainText("You practiced the first course.");
  await expect(composer).toBeEnabled();
  const restored = await fetch(`${base}/conversation`).then(response => response.json());
  assert.equal(restored.sessionId, initial.sessionId);
  assert.equal(restored.model.currentValue, choice.value);
  assert.ok(JSON.stringify(restored.messages).includes("Explain what I missed"));
  for (const message of restored.messages.filter(message => message.role === "user")) {
    assert.ok(message.parts.every(part => part.type !== "text" || !/\[(?:dojo|dojofoo):\/\//u.test(part.content)));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".ui-as-app")).toHaveAttribute("data-narrow", "true");
  await expect.poll(() => page.locator(".ui-as-side").evaluate(node => node.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  await expect(material).toBeVisible();
  await page.screenshot({ path: artifact("interactive-mobile.png") });
  const secondBase = base.replace("/first/", "/second/");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(route.replace("course=first", "course=second"));
  await expect(material).toContainText("Material from second");
  assert.equal((await fetch(`${secondBase}/conversation`).then(response => response.json())).sessionId, null);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("textbox", { name: "Your answer", exact: true }).fill("resources");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(material).toContainText("Correct: resources");
  assert.equal((await fetch(base).then(response => response.json())).current.id, "finish");
  await page.goto(`${origin}/interactive?course=first`);
  await expect(material).toContainText("You practiced the first course.");
  await expect(composer).toBeEnabled();
  await expect(page.getByTestId("chat-pane")).toContainText("Help me understand the first material");
  assert.equal(await readFile(join(scratch, "first/lesson.json"), "utf8"), sourceBefore);
  assert.deepEqual(errors, []);
  await writeFile(artifact("native-requests.json"), JSON.stringify(endpoint.requests, null, 2));
  console.log("Real CLI/interactive browser: two installed courses, exact target/assets/MDX, no-agent reading, native grounded replies, answer guard/feedback, progress, model, transcript and server-restart restoration passed.");
  }
} catch (error) {
  console.error(output);
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
