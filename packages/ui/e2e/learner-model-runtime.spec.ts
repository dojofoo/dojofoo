import { expect, test } from "@playwright/test";
import { fork } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

test("the built learner uses an advertised native model and retains it after restart", async ({ page }) => {
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
    return message as { url: string; course: string };
  };
  try {
    const { url, course } = await ready();
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
