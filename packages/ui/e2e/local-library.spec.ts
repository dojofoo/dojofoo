import { expect, test } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { observeLocalContext } from "@dojofoo/config/local-state";

test("the UIX library discovers real installations and preserves workspace choices", async ({ page }, info) => {
  const scratch = await mkdtemp(join(tmpdir(), "dojo-library-browser-"));
  const home = join(scratch, "state");
  const cli = fileURLToPath(new URL("../../cli/dist/index.js", import.meta.url));
  const environment = { ...process.env, DOJOFOO_HOME: home, DO_NOT_TRACK: "1" };
  const workspaces = [join(scratch, "alpha"), join(scratch, "beta"), join(scratch, "gamma")];
  let server: ReturnType<typeof spawn> | undefined;
  let output = "";
  try {
    for (const [name, language, file] of [["library-course", "JavaScript", "kata.cjs"], ["python-course", "Python", "kata.py"]]) {
      const source = join(scratch, "sources", name);
      await mkdir(join(source, "lessons"), { recursive: true });
      await writeFile(join(source, "dojo.yaml"), `mode: katas\nname: ${name}\nversion: 0.0.1\ndescription: A local library fixture.\nlanguage: ${language}\ntest: echo ok\nkatas:\n  - name: first\n    template: lessons/${file}\n`);
      await writeFile(join(source, "lessons", file), language === "Python" ? "answer = 0\n" : "module.exports = 0;\n");
      for (const workspace of name === "library-course" ? workspaces.slice(0, 2) : workspaces.slice(2)) {
        await mkdir(workspace, { recursive: true });
        execFileSync(process.execPath, [cli, "add", source], { cwd: workspace, env: environment, stdio: "pipe" });
        observeLocalContext(workspace, { stateHome: home });
      }
    }
    const port = await availablePort();
    const origin = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [cli, "ui", "--no-open", "--no-portless", "--port", String(port)], {
      cwd: workspaces[0], detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
      env: { ...environment, DOJO_PROJECT_ROOT: workspaces[0], HOST: "127.0.0.1", CI: "", TEST: "" },
    });
    server.stdout?.on("data", chunk => { output += chunk; });
    server.stderr?.on("data", chunk => { output += chunk; });
    await expect.poll(async () => {
      if (server?.exitCode !== null) throw new Error(output);
      try { return (await fetch(`${origin}/api/control/courses`)).status; } catch { return 0; }
    }, { message: "The isolated built CLI must serve real control data", timeout: 30_000 }).toBe(200);
    const courses = await page.request.get(`${origin}/api/control/courses`).then(response => response.json()) as Array<{ workspaceId: string; dojo: string; workspaceName: string }>;
    expect(courses).toHaveLength(3);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin);
    await expect(page.getByRole("heading", { name: "Your courses", exact: true })).toBeVisible();
    await expect(page.locator(".ui-as-app")).toBeVisible();
    await expect(page.locator(".ui-card:not(.ui-card--add)")).toHaveCount(4);
    await expect(page.locator(".ui-card__figure")).toHaveCount(0);
    await expect(page.getByText("Alex Morgan", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Your courses" })).toHaveCSS("font-family", /Inter/);
    await page.getByRole("button", { name: /^Language:/ }).click();
    await page.getByRole("menuitemradio", { name: "Python", exact: true }).click();
    const python = courses.find(course => course.workspaceName === "gamma")!;
    await expect(page.locator(".ui-card:not(.ui-card--add)")).toHaveCount(1);
    await expect(page.locator("a.ui-card")).toHaveAttribute("href", new RegExp(`/course/${python.workspaceId}/`));
    await page.getByRole("button", { name: /^Language:/ }).click();
    await page.getByRole("menuitemradio", { name: "All languages", exact: true }).click();
    await page.getByRole("button", { name: /^Search$/, exact: true }).click();
    const palette = page.getByRole("dialog", { name: "Search your courses", exact: true });
    await expect(palette).toBeVisible();
    await palette.getByRole("combobox").fill("library");
    await palette.getByRole("option", { name: /library course/i }).click();
    const chooser = page.getByRole("dialog", { name: /Continue library course/i });
    await expect(chooser).toBeVisible();
    await chooser.getByRole("button", { name: /^Course workspace:/ }).click();
    await page.getByRole("menuitemradio", { name: /^beta ·/ }).click();
    await expect(chooser.getByRole("button", { name: /^Course workspace:/ })).toContainText("beta");
    await expect(chooser.getByRole("button", { name: /^Course session:/ })).toContainText("Start current lesson");
    await page.screenshot({ path: info.outputPath("library-workspace-choice.png") });
    await chooser.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Continue library course/i, includeHidden: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("library-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".ui-as-app")).toHaveAttribute("data-narrow", "true");
    await expect(page.locator(".ui-as-side")).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("heading", { name: "Your courses" })).toBeInViewport();
    await page.screenshot({ path: info.outputPath("library-mobile.png") });
    for (const workspace of workspaces) {
      const course = courses.find(item => item.workspaceName === workspace.split("/").at(-1))!;
      execFileSync(process.execPath, [cli, "remove", course.dojo], { cwd: workspace, env: environment, stdio: "pipe" });
    }
    await page.reload();
    await expect(page.getByRole("link", { name: "Create your own dojo", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "How to run a dojo", exact: true })).toBeVisible();
    await expect(page.locator(".ui-card:not(.ui-card--add)")).toHaveCount(2);
    await expect(page.getByRole("button", { name: /Add a course/ })).toBeVisible();
    const sessions = await page.request.get(`${origin}/api/control/sessions`).then(response => response.json()) as Array<{ ownership: string }>;
    // CLI commands may observe the calling agent's external session. Browsing
    // must never start or adopt a managed/owned teaching conversation.
    expect(sessions.filter(session => session.ownership !== "external")).toEqual([]);
    expect(errors).toEqual([]);
  } catch (error) {
    await page.screenshot({ path: info.outputPath("library-failure.png") });
    throw error;
  } finally {
    await page.goto("about:blank").catch(() => {});
    if (server?.pid && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, "exit", { signal: AbortSignal.timeout(10_000) });
      process.kill(process.platform === "win32" ? server.pid : -server.pid, "SIGTERM");
      await exited;
    }
    await rm(scratch, { recursive: true, force: true });
  }
});

async function availablePort() {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("No local test port available");
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return address.port;
}
