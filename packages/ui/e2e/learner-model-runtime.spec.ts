import { expect, test } from "@playwright/test";
import { execFileSync, fork } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

test("Codex sends through the isolated loopback provider", async ({ request }) => {
  test.skip(process.env.DOJO_AUTHORING_RUNTIME_E2E !== "1", "Real native runtime, loopback inference only.");
  test.setTimeout(90_000);
  const fixture = fork(fileURLToPath(new URL("../../authoring/src/eve/browser.fixture.mjs", import.meta.url)), [], {
    stdio: ["ignore", "pipe", "pipe", "ipc"], env: { ...process.env, DOJO_AUTHORING_ENTRY_FIXTURE: "1" },
  });
  let logs = "";
  fixture.stdout?.on("data", chunk => { logs += chunk; });
  fixture.stderr?.on("data", chunk => { logs += chunk; });
  try {
    const [ready] = await Promise.race([
      once(fixture, "message", { signal: AbortSignal.timeout(60_000) }),
      once(fixture, "exit").then(() => { throw new Error(logs); }),
    ]);
    expect(ready.ready).toBe(true);
    await writeFile(join(ready.course, "src/installed-start/SENSEI.md"), "# First step\n\nExplain this pure function.\n");
    const courses = await (await request.get(`${ready.url}api/control/courses`)).json();
    const course = courses.find((item: { dojo: string }) => item.dojo === "browser-authoring-fixture");
    const api = `${ready.url}api/workspaces/${course.workspaceId}/courses/${course.dojo}/lessons/installed-start`;
    const selected = await request.post(`${api}/sessions`, { data: { harness: "codex" } });
    expect(selected.ok(), await selected.text()).toBe(true);
    const response = await request.post(`${api}/messages`, { data: { threadId: "native-codex-probe", runId: "probe", tools: [], context: [],
      messages: [{ id: "probe-message", role: "user", content: "Acknowledge this loopback test." }] } });
    const events = await response.text();
    expect(response.ok(), events).toBe(true);
    expect(events).toContain("Ready to teach.");
  } finally {
    if (fixture.exitCode === null && fixture.signalCode === null) {
      const exited = once(fixture, "exit");
      fixture.kill("SIGTERM");
      await exited;
    }
    await writeFile(test.info().outputPath("runtime.log"), logs);
  }
});

test("the built learners retain native models and per-agent conversations after restart", async ({ page }) => {
  test.skip(process.env.DOJO_AUTHORING_RUNTIME_E2E !== "1", "Real native runtime, loopback inference only.");
  test.setTimeout(180_000);
  const requestsFile = test.info().outputPath("inference-requests.json");
  const fixture = fork(fileURLToPath(new URL("../../authoring/src/eve/browser.fixture.mjs", import.meta.url)), [], {
    stdio: ["ignore", "pipe", "pipe", "ipc"], env: { ...process.env, DOJO_AUTHORING_ENTRY_FIXTURE: "1", DOJO_AUTHORING_REQUEST_LOG: requestsFile },
  });
  let logs = "";
  let selected: string | undefined;
  fixture.stdout?.on("data", chunk => { logs += chunk; });
  fixture.stderr?.on("data", chunk => { logs += chunk; });
  const ready = async () => {
    const [message] = await Promise.race([
      once(fixture, "message", { signal: AbortSignal.timeout(90_000) }),
      once(fixture, "exit").then(() => { throw new Error(logs); }),
    ]);
    expect(message.ready).toBe(true);
    return message as { url: string; course: string; root: string };
  };
  try {
    const { url, course, root } = await ready();
    // This isolated installed kata needs guidance before entering the learner.
    await writeFile(join(course, "src/installed-start/SENSEI.md"), "# First step\n\nHelp the learner reason about a pure function.\n");
    const original = await readFile(join(course, "src/installed-start/kata.ts"), "utf8");
    const courses = await (await page.request.get(`${url}api/control/courses`)).json();
    const active = courses.find((item: { dojo: string }) => item.dojo === "browser-authoring-fixture");
    expect(active).toBeTruthy();
    const api = `${url}api/workspaces/${active.workspaceId}/courses/${active.dojo}/lessons/installed-start`;
    await page.goto(`${url}course/${active.workspaceId}/${active.dojo}/lesson/installed-start`);
    const composer = page.getByTestId("chat-composer");
    await expect(composer.getByRole("button", { name: "Agent", exact: true })).toContainText("OpenCode");
    await expect(page.getByText("Ready to teach.", { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(composer.getByRole("textbox")).toBeEnabled();
    const before = await (await page.request.get(api)).json();
    expect(before.harness).toBe("opencode");
    expect(before.harnesses).not.toContain("pi");
    const choice = before.model.options.find((item: { value: string; name: string }) => /^openai\/gpt-(?:4\.1|4o-mini)(?:$|-)/u.test(item.value) && item.value !== before.model.currentValue
      && before.model.options.filter((other: { name: string }) => other.name === item.name).length === 1);
    expect(choice, "The native OpenCode catalog must offer another OpenAI model").toBeTruthy();
    selected = choice.value;
    await composer.getByRole("button", { name: "Model", exact: true }).click();
    await page.getByRole("menuitemradio", { name: `${choice.name}${choice.group ? ` ${choice.group}` : ""}`, exact: true }).click();
    await expect.poll(async () => (await (await page.request.get(api)).json()).model.currentValue).toBe(choice.value);
    expect((await (await page.request.get(api)).json()).sessionId).toBe(before.sessionId);
    await composer.getByRole("textbox").fill("Use my selected model.");
    await composer.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Ready to teach.", { exact: true })).toHaveCount(2, { timeout: 90_000 });
    await expect(composer.getByRole("textbox")).toBeEnabled();
    const learnerUrl = page.url();
    await page.goto("about:blank");
    const restarted = ready();
    fixture.send("restart");
    await restarted;
    await page.goto(learnerUrl);
    await expect(composer.getByRole("button", { name: "Model", exact: true })).toContainText(choice.name);
    const after = await (await page.request.get(api)).json();
    expect(after.sessionId).toBe(before.sessionId);
    expect(after.harness).toBe("opencode");
    expect(after.model.currentValue).toBe(choice.value);
    expect(await readFile(join(course, "src/installed-start/kata.ts"), "utf8")).toBe(original);
    await page.screenshot({ path: test.info().outputPath("native-learner-model.png"), animations: "disabled" });

    const source = join(root, "interactive-source");
    await mkdir(source);
    await writeFile(join(source, "dojo.yaml"), "mode: interactive\nname: interactive-fixture\nversion: 0.0.1\ndescription: Learn the course controls.\nlessons: lesson.json\n");
    await writeFile(join(source, "lesson.json"), JSON.stringify({ id: "intro", title: "Course controls", steps: [
      { id: "read", type: "present", title: "Find your way", content: "Read the course material and ask Sensei for a small hint." },
    ] }));
    execFileSync(process.execPath, [fileURLToPath(new URL("../../cli/dist/index.js", import.meta.url)), "add", source], {
      cwd: join(root, "learning"), timeout: 30_000,
      env: { ...process.env, DOJO_PROJECT_ROOT: join(root, "learning"), DOJOFOO_HOME: join(root, "home/.dojofoo"), DO_NOT_TRACK: "1", MISE_TRUSTED_CONFIG_PATHS: root },
    });
    const interactiveCourse = (await (await page.request.get(`${url}api/control/courses`)).json())
      .find((item: { dojo: string }) => item.dojo === "interactive-fixture");
    expect(interactiveCourse).toBeTruthy();
    const interactiveUrl = `${url}interactive?workspace=${interactiveCourse.workspaceId}&course=interactive-fixture`;
    const interactiveApi = `${url}api/workspaces/${interactiveCourse.workspaceId}/courses/interactive-fixture/interactive`;
    await page.goto(interactiveUrl);
    const agent = page.getByRole("button", { name: "Agent", exact: true });
    const question = page.getByRole("textbox", { name: "Message the sensei", exact: true });
    await expect(agent).toContainText("OpenCode");
    await question.fill("Where should I begin?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Ready to teach.", { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(question).toBeEnabled();
    const originalInteractive = await (await page.request.get(`${interactiveApi}/conversation`)).json();
    const interactiveChoice = originalInteractive.model.options.find((item: { value: string }) => item.value === choice.value);
    expect(interactiveChoice).toBeTruthy();
    await page.getByRole("button", { name: "Model", exact: true }).click();
    await page.getByRole("menuitemradio", { name: `${interactiveChoice.name}${interactiveChoice.group ? ` ${interactiveChoice.group}` : ""}`, exact: true }).click();
    await expect.poll(async () => (await (await page.request.get(`${interactiveApi}/conversation`)).json()).model.currentValue).toBe(choice.value);
    await question.fill("Keep my course question");
    const selectAgent = async (name: string) => {
      await agent.click();
      const changed = page.waitForResponse(response => response.request().method() === "PUT"
        && new URL(response.url()).pathname.endsWith("/configuration/harness"));
      await page.getByRole("menuitemradio", { name: new RegExp(`^${name}`) }).click();
      const response = await changed;
      expect(response.ok(), await response.text()).toBe(true);
      await expect(agent).toContainText(name, { timeout: 60_000 });
    };
    await selectAgent("Codex");
    const codex = await (await page.request.get(`${interactiveApi}/conversation`)).json();
    expect(codex.harness).toBe("codex");
    expect(codex.sessionId).not.toBe(originalInteractive.sessionId);
    expect(codex.messages).toEqual([]);
    await selectAgent("OpenCode");
    await expect(question).toHaveValue("Keep my course question");
    await expect(page.getByText("Ready to teach.", { exact: true })).toBeVisible();
    expect((await (await page.request.get(`${interactiveApi}/conversation`)).json()).sessionId).toBe(originalInteractive.sessionId);
    await page.goto("about:blank");
    const interactiveRestart = ready();
    fixture.send("restart");
    await interactiveRestart;
    await page.goto(interactiveUrl);
    await expect(agent).toContainText("OpenCode");
    await expect(page.getByText("Ready to teach.", { exact: true })).toBeVisible();
    const restored = await (await page.request.get(`${interactiveApi}/conversation`)).json();
    expect(restored.sessionId).toBe(originalInteractive.sessionId);
    expect(restored.model.currentValue).toBe(choice.value);
    await selectAgent("Codex");
    const preparedCodex = await (await page.request.get(`${interactiveApi}/conversation`)).json();
    // Codex does not persist an unused thread. Re-preparing that empty selection
    // is explicit; submitted conversations must keep their original native ID.
    expect(preparedCodex.sessionId).not.toBe(codex.sessionId);
    expect(preparedCodex.messages).toEqual([]);
    await question.fill("Remember this Codex conversation.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Ready to teach.", { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(question).toBeEnabled();
    await page.goto("about:blank");
    const codexRestart = ready();
    fixture.send("restart");
    await codexRestart;
    await page.goto(interactiveUrl);
    await expect(agent).toContainText("Codex");
    await expect(page.getByText("Ready to teach.", { exact: true })).toBeVisible();
    expect((await (await page.request.get(`${interactiveApi}/conversation`)).json()).sessionId).toBe(preparedCodex.sessionId);
    await selectAgent("OpenCode");
    const originalAgain = await (await page.request.get(`${interactiveApi}/conversation`)).json();
    expect(originalAgain.sessionId).toBe(originalInteractive.sessionId);
    expect(originalAgain.model.currentValue).toBe(choice.value);
    expect((await (await page.request.get(interactiveApi)).json()).step).toBe(0);
    expect(await readFile(join(course, "src/installed-start/kata.ts"), "utf8")).toBe(original);
    await page.screenshot({ path: test.info().outputPath("native-interactive-agent.png"), animations: "disabled" });
  } finally {
    if (fixture.exitCode === null && fixture.signalCode === null) {
      const exited = once(fixture, "exit");
      fixture.kill("SIGTERM");
      await exited;
    }
    await writeFile(test.info().outputPath("runtime.log"), logs);
  }
  const requests = JSON.parse(await readFile(requestsFile, "utf8")) as Array<{ model?: string }>;
  expect(requests.some(request => request.model === selected?.slice("openai/".length)), "The selected model must receive the actual native request").toBe(true);
});
