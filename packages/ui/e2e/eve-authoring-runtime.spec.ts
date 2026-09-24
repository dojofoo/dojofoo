import { expect, test } from "@playwright/test";
import { fork } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Opt-in infrastructure test: real Eve + official OpenCode, local model only.
test("authors, restarts, answers and opens an isolated learner trial", async ({ page, context }) => {
  test.skip(process.env.DOJO_AUTHORING_RUNTIME_E2E !== "1", "Requires local OpenCode and built @dojofoo/agent");
  test.setTimeout(300_000);
  const fixture = fork(fileURLToPath(new URL("../../authoring/src/eve/browser.fixture.mjs", import.meta.url)), [], {
    stdio: ["ignore", "pipe", "pipe", "ipc"], execArgv: [],
  });
  let logs = "";
  fixture.stdout?.on("data", chunk => { logs += chunk; });
  fixture.stderr?.on("data", chunk => { logs += chunk; });
  const ready = async () => {
    const [message] = await once(fixture, "message", { signal: AbortSignal.timeout(60_000) });
    expect(message.ready).toBe(true);
    return message as { url: string; course: string };
  };
  try {
    const { url, course } = await ready();
    await page.goto(`${url}authoring`);
    await expect(page.getByRole("radio", { name: "Beginners", exact: true })).toBeVisible({ timeout: 120_000 });
    const sessionUrl = page.url();
    expect(sessionUrl).toContain("session=wrun_");

    // Edit through the same CodeMirror document and save shortcut as an author.
    const edit = async (source: string) => {
      await page.getByRole("textbox", { name: "Code editor" }).click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.insertText(source);
      const saved = page.waitForResponse(response => response.request().method() === "PUT" && response.url().includes("/api/authoring/"));
      await page.keyboard.press("ControlOrMeta+s");
      expect((await saved).ok()).toBe(true);
    };
    await edit("mode: katas\nname: Browser authoring fixture\nversion: 0.0.1\ndescription: Learn pure functions.\nlanguage: typescript\ntest: npx vitest run {template}\nkatas: []\n");
    await page.getByRole("button", { name: "Lessons actions" }).click();
    await page.getByRole("button", { name: "Add lesson", exact: true }).click();
    await expect(page.getByRole("tab", { name: "SENSEI.md", exact: true })).toBeVisible();
    await edit("# Pure functions\n\nAsk the learner to predict an output before editing.\n");
    expect(await readFile(join(course, "src/001-untitled-lesson/SENSEI.md"), "utf8")).toContain("predict an output");

    // Disconnect Vite's HMR client so its automatic reload cannot race the
    // explicit navigation used to verify durable session recovery.
    await page.goto("about:blank");
    const restarted = ready();
    fixture.send("restart");
    await restarted;
    await page.goto(sessionUrl);
    const answer = page.getByRole("radio", { name: "Beginners", exact: true });
    await expect(answer).toBeVisible({ timeout: 60_000 });
    await answer.click();
    await expect(page.getByText("Ready to teach.", { exact: true })).toBeVisible({ timeout: 120_000 });
    await expect(answer).toHaveAttribute("aria-checked", "true");
    await expect(page).toHaveURL(sessionUrl);
    await page.getByRole("treeitem", { name: "SENSEI.md Actions for SENSEI.md", exact: true }).click();
    const opened = context.waitForEvent("page");
    await page.getByRole("button", { name: "Trial", exact: true }).click();
    const trial = await opened;
    await expect(trial).toHaveURL(/\/course\/[^/]+\/browser-authoring-fixture\/lesson\/001-untitled-lesson/);
    await expect(trial.getByRole("textbox", { name: "Message the sensei" })).toBeEnabled({ timeout: 60_000 });
    await expect(trial.getByText("Ready to teach.", { exact: true })).toBeVisible({ timeout: 120_000 });
  } finally {
    await test.info().attach("runtime-log", { body: logs, contentType: "text/plain" });
    if (fixture.exitCode === null && fixture.signalCode === null) {
      const exited = once(fixture, "exit");
      fixture.kill("SIGTERM");
      await exited;
    }
  }
});
