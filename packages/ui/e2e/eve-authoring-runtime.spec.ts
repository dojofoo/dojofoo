import { expect, test } from "@playwright/test";
import { execFileSync, fork } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Opt-in infrastructure test: real Eve + official OpenCode, local model only.
test("authors, resumes, checks, reviews and advances an isolated learner trial", async ({ page, context }) => {
  test.skip(process.env.DOJO_AUTHORING_RUNTIME_E2E !== "1", "Requires local OpenCode and built @dojofoo/agent");
  test.setTimeout(300_000);
  context.setDefaultTimeout(30_000);
  const fixture = fork(fileURLToPath(new URL("../../authoring/src/eve/browser.fixture.mjs", import.meta.url)), [], {
    stdio: ["ignore", "pipe", "pipe", "ipc"], execArgv: [],
    env: { ...process.env, DOJO_AUTHORING_REQUEST_LOG: test.info().outputPath("inference-requests.json") },
  });
  let logs = "";
  let fixtureRoot: string | undefined;
  fixture.stdout?.on("data", chunk => { logs += chunk; });
  fixture.stderr?.on("data", chunk => { logs += chunk; });
  const ready = async () => {
    if (fixture.exitCode !== null) throw new Error(`Authoring fixture exited: ${logs}`);
    const [message] = await Promise.race([
      once(fixture, "message", { signal: AbortSignal.timeout(120_000) }),
      once(fixture, "exit").then(() => { throw new Error(`Authoring fixture exited: ${logs}`); }),
    ]);
    expect(message.ready).toBe(true);
    return message as { url: string; course: string; root: string };
  };
  try {
    const { url, course, root } = await ready();
    fixtureRoot = root;
    await page.goto(`${url}authoring`);
    await expect(page.getByRole("radio", { name: /^Beginners/ })).toBeVisible({ timeout: 120_000 });
    const sessionUrl = page.url();
    expect(sessionUrl).toContain("session=wrun_");
    const sessionId = new URL(sessionUrl).searchParams.get("session")!;
    const workspaceId = new URL(sessionUrl).searchParams.get("workspace")!;
    const sessionApi = `${url}api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}`;
    const snapshot = await page.request.get(sessionApi);
    expect(snapshot.ok()).toBe(true);
    const saved = await snapshot.json();
    expect(saved.position).toBeGreaterThan(0);
    expect((await (await page.request.get(`${sessionApi}/messages`)).json()).data.length).toBeGreaterThan(0);
    await page.reload();
    await expect(page.getByRole("radio", { name: /^Beginners/ })).toBeVisible();
    await expect(page.getByText(/Eve stream ended|no saved events/)).toHaveCount(0);
    await expect(page.locator(".ui-as-chat__composer .ui-as-composer")).toBeVisible();
    await expect(page.getByRole("link", { name: "Dojo dashboard", exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("authoring-pages-layout.png"), animations: "disabled" });

    const queued = ["Keep examples short", "Focus on one example"];

    // Edit through the same Monaco document and save shortcut as an author.
    const edit = async (path: string, source: string) => {
      const filename = path.split("/").at(-1)!;
      const tab = page.getByRole("tab", { name: new RegExp(`^${filename.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`) });
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await page.getByRole("textbox", { name: "Code editor", exact: true }).focus();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.insertText(source);
      await expect(tab).toHaveAccessibleName(/unsaved changes/);
      const saved = page.waitForResponse(response => response.request().method() === "PUT" && response.url().includes("/api/authoring/"));
      await page.keyboard.press("ControlOrMeta+s");
      expect((await saved).ok()).toBe(true);
    };
    await edit("dojo.yaml", "mode: katas\nname: Browser authoring fixture\nversion: 0.0.1\ndescription: Learn pure functions.\nlanguage: typescript\ntest: npx vitest run {template}\nkatas: []\n");
    await page.getByRole("button", { name: "New lesson", exact: true }).click();
    await page.getByRole("button", { name: "SENSEI.md", exact: true }).click();
    await expect(page.getByRole("tab", { name: "SENSEI.md", exact: true })).toBeVisible();
    await edit("src/001-untitled-lesson/SENSEI.md", "# Pure functions\n\nAsk the learner to predict an output before editing.\n");
    expect(await readFile(join(course, "src/001-untitled-lesson/SENSEI.md"), "utf8")).toContain("predict an output");
    await page.getByRole("button", { name: "kata.ts", exact: true }).click();
    await edit('src/001-untitled-lesson/kata.ts', 'export function double(value: number): number { throw new Error("Your turn"); }\n');
    await page.getByRole("button", { name: "kata.test.ts", exact: true }).click();
    await edit('src/001-untitled-lesson/kata.test.ts', 'import { it, expect } from "vitest";\nimport { double } from "@/katas/001-untitled-lesson/kata";\nit("doubles a positive value", () => expect(double(2)).toBe(4));\nit("keeps zero", () => expect(double(0)).toBe(0));\n');
    // Author the next lesson separately so advancement has a real destination.
    await page.getByRole("button", { name: "New lesson", exact: true }).click();
    const second = page.locator(".ui-as-side__branch").filter({ has: page.getByRole("button", { name: "Untitled lesson", exact: true }) }).nth(1);
    await second.getByRole("button", { name: "SENSEI.md", exact: true }).click();
    await edit("src/002-untitled-lesson/SENSEI.md", "# Identity\n\nAsk the learner what should stay unchanged.\n");
    await second.getByRole("button", { name: "kata.ts", exact: true }).click();
    await edit('src/002-untitled-lesson/kata.ts', 'export function identity(value: number): number { throw new Error("Your turn"); }\n');
    await second.getByRole("button", { name: "kata.test.ts", exact: true }).click();
    await edit('src/002-untitled-lesson/kata.test.ts', 'import { it, expect } from "vitest";\nimport { identity } from "@/katas/002-untitled-lesson/kata";\nit("keeps its input", () => expect(identity(3)).toBe(3));\n');
    const selectFirstLesson = async () => {
      const button = page.getByRole("button", { name: "Untitled lesson", exact: true }).first();
      if (await button.getAttribute("aria-expanded") !== "true") await button.click();
      const first = page.locator(".ui-as-side__branch").filter({ has: page.getByRole("button", { name: "Untitled lesson", exact: true }) }).first();
      await expect(button).toHaveAttribute("aria-expanded", "true");
      await first.getByRole("button", { name: "SENSEI.md", exact: true }).click();
    };
    await selectFirstLesson();

    // Disconnect the browser before restarting the actual CLI server.
    await page.goto("about:blank");
    const restarted = ready();
    fixture.send("restart");
    await restarted;
    await page.goto(sessionUrl);
    const answer = page.getByRole("radio", { name: /^Beginners/ });
    await expect(answer).toBeVisible({ timeout: 60_000 });
    // The existing client holds normal messages behind an unanswered form.
    // They must not be silently converted into free-form question answers.
    const composer = page.getByTestId("authoring-chat-composer").getByRole("textbox");
    for (const message of queued) {
      await composer.fill(message);
      await composer.press("Enter");
      await expect(page.locator('[data-slot="message-queue"]')).toContainText(message);
    }
    await expect(answer).toBeEnabled();
    await answer.click();
    await expect(page.getByText("Ready to teach.", { exact: true }).first()).toBeVisible({ timeout: 120_000 });
    for (const message of queued) await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(page.locator('[data-slot="message-queue"]')).toHaveCount(0);
    // An empty optimistic queue means accepted, not durably processed. Verify
    // the actual saved transcript before disconnecting and testing recovery.
    await expect.poll(async () => {
      const settled = await (await page.request.get(`${sessionApi}/messages?per_page=500`)).json();
      return settled.data.filter((message: { role: string }) => message.role === "user")
        .map((message: { parts: Array<{ content?: string }> }) => message.parts.map(part => part.content ?? "").join(""));
    }).toEqual(queued);
    await expect(answer).toHaveAttribute("aria-checked", "true");
    await expect(page).toHaveURL(sessionUrl);
    await page.reload();
    await expect(page.getByText("Ready to teach.", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Eve stream ended|no saved events/)).toHaveCount(0);
    await expect(page).toHaveURL(sessionUrl);
    await selectFirstLesson();
    await composer.fill("Continue authoring");
    await composer.press("Enter");
    await expect.poll(async () => {
      const settled = await (await page.request.get(`${sessionApi}/messages?per_page=500`)).json();
      return JSON.stringify(settled.data);
    }).toContain("Continue authoring");
    const opened = context.waitForEvent("page");
    const launched = page.waitForResponse(response => response.request().method() === "POST"
      && new URL(response.url()).pathname.endsWith("/lessons/001-untitled-lesson/trials"));
    await page.getByRole("button", { name: "Trial", exact: true }).click();
    const trialScope = await (await launched).json();
    const trial = await opened;
    await expect(trial).toHaveURL(/\/course\/[^/]+\/browser-authoring-fixture\/lesson\/001-untitled-lesson/);
    await expect(trial.getByRole("textbox", { name: "Message the sensei" })).toBeEnabled({ timeout: 60_000 });
    await expect(trial.getByText("Ready to teach.", { exact: true })).toBeVisible({ timeout: 120_000 });
    const api = `/api/workspaces/${trialScope.workspaceId}/courses/${trialScope.courseId}/lessons/${trialScope.lessonId}`;
    await trial.getByRole("button", { name: "Check", exact: true }).click();
    await expect.poll(async () => (await (await trial.request.get(new URL(api, url).href)).json()).result,
      { timeout: 120_000 }).toMatchObject({ total: 2, failed: 2 });
    await trial.getByRole("tab", { name: "kata.ts", exact: true }).click();
    await trial.getByRole("textbox", { name: "Code editor" }).focus();
    await trial.keyboard.press("ControlOrMeta+a");
    await trial.keyboard.insertText("export function double(value: number): number { return value * 2; }\n");
    await trial.getByRole("button", { name: "Check", exact: true }).click();
    await expect.poll(async () => (await (await trial.request.get(new URL(api, url).href)).json()).result,
      { timeout: 120_000 }).toMatchObject({ total: 2, passed: 2, complete: true });
    expect(await readFile(join(course, "src/001-untitled-lesson/kata.ts"), "utf8")).toContain('throw new Error("Your turn")');
    const message = trial.getByRole("textbox", { name: "Message the sensei" });
    for (const [index, choice] of ["Review", "Move on"].entries()) {
      await message.fill("Complete this fixture lesson");
      const submitted = trial.waitForRequest(request => request.method() === "POST"
        && new URL(request.url()).pathname.endsWith("/messages")
        && (request.postData() ?? "").includes("Complete this fixture lesson"));
      await trial.getByRole("button", { name: "Send", exact: true }).click({ timeout: 30_000 });
      await submitted;
      // Answered forms remain in history, with their other choices disabled.
      // Wait for the new form before selecting its choice, not the old row.
      await expect(trial.getByRole("heading", { name: "What would you like to do next?", exact: true })).toHaveCount(index + 1);
      const option = trial.getByRole("radio", { name: choice, exact: true }).last();
      await expect(option).toBeEnabled();
      await option.click({ timeout: 30_000 });
      if (choice === "Review") {
        await expect(trial.getByText("Ready to teach.", { exact: true }).last()).toBeVisible();
      }
    }
    await expect(trial.getByRole("heading", { level: 2, name: /002 Untitled Lesson/ })).toBeVisible();
    await expect(trial.getByText("Ready to teach.", { exact: true })).toBeVisible();
    await expect(trial).toHaveURL(/\/session\/ses_/);
    const learnerUrl = trial.url();
    const nextApi = api.replace("001-untitled-lesson", "002-untitled-lesson");
    const beforeRestart = await (await trial.request.get(new URL(nextApi, url).href)).json();
    expect(beforeRestart.sessionId).toBeTruthy();
    await page.goto("about:blank");
    await trial.goto("about:blank");
    const resumed = ready();
    fixture.send("restart");
    await resumed;
    await trial.goto(learnerUrl);
    await expect(trial.getByRole("heading", { level: 2, name: /002 Untitled Lesson/ })).toBeVisible();
    await expect(trial.getByText("Ready to teach.", { exact: true })).toBeVisible();
    const afterRestart = await (await trial.request.get(new URL(nextApi, url).href)).json();
    expect(afterRestart.sessionId).toBe(beforeRestart.sessionId);
    expect(afterRestart.code).toContain('throw new Error("Your turn")');
  } finally {
    if (fixture.exitCode === null && fixture.signalCode === null) {
      const exited = once(fixture, "exit");
      fixture.kill("SIGTERM");
      await exited;
    }
    await writeFile(test.info().outputPath("runtime.log"), logs);
    await test.info().attach("runtime-log", { body: logs, contentType: "text/plain" });
    expect.soft(logs, "The shipped Kyoshi instructions must reach the native harness").toContain('"shippedInstructionsLoaded":true');
    expect.soft(logs, "The shipped question tool must execute").toContain('"questionToolUsed":true');
    if (fixtureRoot) {
      const surviving = execFileSync("ps", ["-axo", "pid=,args="], { encoding: "utf8" })
        .split("\n").filter(line => line.includes(fixtureRoot!));
      expect.soft(surviving, "Native fixture processes must stop with their server").toEqual([]);
      for (const line of surviving) {
        const pid = Number(line.trim().split(/\s+/)[0]);
        if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("Invalid fixture process identity");
        try { process.kill(pid, "SIGTERM"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      }
    }
  }
});
