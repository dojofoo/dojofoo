import { expect, test } from "./agent-chat.fixture";
import { agentDefinitions } from "@dojofoo/config/agents";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { observeLocalContext } from "@dojofoo/config/local-state";

test("the UIX library separates installed sessions from course previews and preserves sidebar navigation", async ({ page, mountAgentChat }, info) => {
  test.setTimeout(90_000);
  const scratch = await mkdtemp(join(tmpdir(), "dojo-library-browser-"));
  const home = join(scratch, "state");
  const cli = fileURLToPath(new URL("../../cli/dist/index.js", import.meta.url));
  const environment = { ...process.env, DOJOFOO_HOME: home, DO_NOT_TRACK: "1" };
  const workspaces = [join(scratch, "alpha"), join(scratch, "beta")];
  let server: ReturnType<typeof spawn> | undefined;
  let output = "";
  let releaseSetup = () => {};
  let releaseRefresh = () => {};
  try {
    for (const [name, language, file] of [["library-course", "JavaScript", "kata.cjs"], ["python-course", "Python", "kata.py"]]) {
      const source = join(scratch, "sources", name);
      await mkdir(join(source, "lessons"), { recursive: true });
      await writeFile(join(source, "dojo.yaml"), `mode: katas\nname: ${name}\nversion: 0.0.1\ndescription: A local library fixture.\nlanguage: ${language}\ntest: echo ok\nkatas:\n  - name: first\n    template: lessons/${file}\n`);
      await writeFile(join(source, "lessons", file), language === "Python" ? "answer = 0\n" : "module.exports = 0;\n");
      await writeFile(join(source, "lessons", "SENSEI.md"), "# First lesson\n\nPractice editing the solution and checking your work.\n");
      for (const workspace of name === "library-course" ? workspaces.slice(0, 1) : workspaces.slice(1)) {
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
    const courses = await page.request.get(`${origin}/api/control/courses`).then(response => response.json()) as Array<{ workspaceId: string; dojo: string; runId: string; workspaceName: string }>;
    expect(courses).toHaveLength(2);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let piInstalled = false;
    let inventoryAvailable = false;
    const setupReady = new Promise<void>(resolve => { releaseSetup = resolve; });
    let refreshReady = Promise.resolve();
    let failFirstSetup = true;
    await page.route("**/api/local/setup", async route => {
      await setupReady;
      await refreshReady;
      if (failFirstSetup && route.request().method() === "GET") {
        failFirstSetup = false;
        await route.fulfill({ status: 503, json: { error: "Local server restarting" } });
      } else await route.continue();
    });
    await page.route("**/api/local/agents", route => route.fulfill({ json: agentDefinitions.filter(agent => inventoryAvailable && ["claude", "pi", "codex"].includes(agent.id) && (agent.id !== "pi" || piInstalled))
      .map(agent => ({ ...agent, found: true, executable: `/mock/${agent.command}` })) }));
    await page.goto(origin);
    const loading = page.getByRole("status", { name: "Starting Dojo", exact: true });
    await expect(loading).toBeVisible();
    const logo = await loading.getByRole("img", { name: "Dojo.foo", exact: true }).boundingBox();
    expect(Math.abs(logo!.x + logo!.width / 2 - 720)).toBeLessThan(2);
    expect(Math.abs(logo!.y + logo!.height / 2 - 450)).toBeLessThan(2);
    releaseSetup();
    await expect(page.getByRole("alert", { name: "Unable to start Dojo", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Welcome to Dojo, Anonymous" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "No coding agents found. Install an agent to continue; it will appear here automatically." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "How to install an agent" })).toHaveCount(0);
    inventoryAvailable = true;
    const agentChoices = page.getByRole("group", { name: "Agents", exact: true });
    await expect(agentChoices.getByRole("checkbox", { name: /^Claude Code/ })).toBeVisible();
    await expect(agentChoices.getByRole("checkbox", { name: /^Pi/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rescan", exact: true })).toHaveCount(0);
    piInstalled = true;
    await expect(agentChoices.getByRole("checkbox", { name: /^Pi/ })).toBeVisible();
    await expect(page.getByText("For lessons in this dashboard", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("note").filter({ hasText: "Choose one or more agents found on this machine." })).toBeVisible();
    await expect(agentChoices.getByText("Installed", { exact: true })).toHaveCount(0);
    await expect(agentChoices.getByText(/Lessons|Authoring|Terminal/)).toHaveCount(0);
    for (const name of [/^Claude Code/, /^Pi/, /^Codex/]) {
      await agentChoices.getByRole("checkbox", { name }).setChecked(true);
      await expect(agentChoices.getByRole("checkbox", { name })).toBeChecked();
    }
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Pick your first courses" })).toBeVisible();
    for (const title of [/Create your own dojo/, /How to run a dojo/]) {
      const choice = page.getByRole("checkbox", { name: title });
      if (!await choice.isChecked()) await page.locator("label.ui-setup__course").filter({ hasText: title }).click();
      await expect(choice).toBeChecked();
    }
    await page.getByRole("button", { name: "Back", exact: true }).click();
    for (const name of [/^Claude Code/, /^Pi/, /^Codex/]) {
      await expect(agentChoices.getByRole("checkbox", { name })).toBeChecked();
    }
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue anonymously", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Default", exact: true })).toBeChecked();
    await expect(page.getByRole("radio", { name: /^Auto/ })).toBeChecked();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const setupResponse = page.waitForResponse(response => response.url().endsWith("/api/local/setup") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const setup = await setupResponse;
    expect(await setup.json()).toMatchObject({ completed: true, workspace: workspaces[0], agents: ["claude", "pi", "codex"] });
    expect(setup.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Your courses", exact: true })).toBeVisible();
    const installed = await page.request.get(`${origin}/api/control/starters`).then(response => response.json());
    expect(installed).toEqual(expect.arrayContaining(["create-your-own-dojo", "how-to-run-a-dojo"].map(courseId => expect.objectContaining({ courseId, workspaceId: courses.find(course => course.workspaceName === "alpha")!.workspaceId }))));
    const observeRouteSnapshots = () => {
      const state = window as typeof window & { routeSnapshots: Array<{ menu: string; course: boolean }> };
      state.routeSnapshots = [];
      const start = document.startViewTransition.bind(document);
      document.startViewTransition = ((...args: Parameters<typeof start>) => {
        const transition = start(...args);
        void transition.ready.then(() => state.routeSnapshots.push({
          menu: (document.querySelector(".ui-as-side__menu") as HTMLElement | null)?.innerText ?? "",
          course: Boolean(document.querySelector(".ui-as-chat")),
        }), () => {});
        return transition;
      }) as typeof start;
    };
    await page.addInitScript(observeRouteSnapshots);
    await page.evaluate(observeRouteSnapshots);
    await page.getByRole("link", { name: /^How to run a dojo, / }).click();
    await expect(page.getByRole("group", { name: "Lessons", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { routeSnapshots: Array<{ menu: string; course: boolean }> }).routeSnapshots.some(snapshot => snapshot.course && snapshot.menu.includes("Find your place")))).toBe(true);
    const learning = await page.request.get(`${origin}/api/control/courses/how-to-run-a-dojo`).then(response => response.json());
    const sessionUrl = `${origin}/learn/${learning.runId}`;
    await expect(page).toHaveURL(sessionUrl);
    await expect(page.getByRole("group", { name: "Lessons", exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "Dashboard", exact: true })).toHaveCount(0);
    await expect(page.locator('.ui-as-side a[href="/explore"]')).toHaveCount(0);
    await page.locator('.ui-as-chat__crumbs').getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.locator('.ui-as-side a[href="/explore"]').click();
    await expect(page.getByRole("list", { name: "Featuring", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Continue How to run a dojo", exact: true }).click();
    await expect(page).toHaveURL(sessionUrl);
    const surface = page.getByTestId("interactive-material");
    const iframe = surface.locator('iframe');
    const material = page.frameLocator('iframe[title="How to run a dojo slides"]');
    await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
    const bounds = await iframe.boundingBox();
    expect(bounds!.width / bounds!.height).toBeCloseTo(16 / 9, 2);
    await expect(material.locator('.slidev-layout').first()).toBeVisible();
    await expect(material.getByRole("heading", { name: "Find your place", exact: true })).toBeVisible();
    await expect(material.locator("html")).toHaveClass(/dark/);
    const sidebarLessons = page.getByRole("group", { name: "Lessons", exact: true }).locator(".ui-as-side__text");
    await expect(sidebarLessons).toHaveCount(6);
    const lessonTitles = await sidebarLessons.allTextContents();
    await expect(surface.getByRole("tablist")).toHaveCount(0);
    await expect(material.getByRole("button", { name: "Next slide", exact: true })).toHaveCount(0);
    const historyBeforeSlide = await page.evaluate(() => history.length);
    await surface.getByRole("button", { name: "Next slide", exact: true }).click();
    await expect(surface.getByRole("button", { name: "Finish lesson", exact: true })).toBeDisabled();
    await expect(material.getByRole("textbox", { name: "Your answer", exact: true })).toBeVisible();
    expect(await page.evaluate(() => history.length)).toBe(historyBeforeSlide);
    await page.goBack();
    await expect(page).toHaveURL(`${origin}/explore`);
    await page.goForward();
    await expect(page).toHaveURL(sessionUrl);
    await expect(material.getByRole("textbox", { name: "Your answer", exact: true })).toBeVisible();
    await material.getByRole("textbox", { name: "Your answer", exact: true }).fill("a different folder");
    await expect(material.locator('input[data-slot="input"]')).toHaveCount(1);
    await expect(material.locator('button.ui-button').filter({ hasText: "Check answer" })).toBeVisible();
    await material.getByRole("button", { name: "Check answer", exact: true }).click();
    await expect(surface.getByRole("button", { name: "Finish lesson", exact: true })).toBeDisabled();
    await material.getByRole("textbox", { name: "Your answer", exact: true }).fill("the course workspace");
    await material.getByRole("button", { name: "Check answer", exact: true }).click();
    await surface.getByRole("button", { name: "Previous slide", exact: true }).click();
    await expect(material.getByRole("heading", { name: "Find your place", exact: true })).toBeVisible();
    await surface.getByRole("button", { name: "Next slide", exact: true }).click();
    await expect(material.getByRole("status").filter({ hasText: "Correct:" })).toBeVisible();
    await surface.getByRole("button", { name: "Finish lesson", exact: true }).click();
    await expect(material.getByRole("heading", { name: "Lesson complete", exact: true })).toBeVisible();
    await expect(material.getByRole("button", { name: "Next lesson", exact: true })).toHaveCount(0);
    await expect(surface.getByRole("button", { name: "Next lesson", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("course-completion-slide.png") });
    await page.reload();
    await expect(material.getByRole("heading", { name: "Lesson complete", exact: true })).toBeVisible();
    await surface.getByRole("button", { name: "Next lesson", exact: true }).click();
    await expect(material.getByRole("heading", { name: "Find the material for this lesson", exact: true })).toBeVisible();
    expect(await sidebarLessons.allTextContents()).toEqual(lessonTitles);
    await expect(page).toHaveURL(sessionUrl);
    await page.screenshot({ path: info.outputPath("course-lessons-slides.png") });
    await page.locator('.ui-as-chat__crumbs').getByRole("button", { name: "Dashboard", exact: true }).click();
    const savedCourse = page.getByRole("link", { name: /^How to run a dojo, / });
    await expect(savedCourse).toContainText("Lesson 2 of 6 · Slide 1 of 3");
    await savedCourse.click();
    await expect(page).toHaveURL(sessionUrl);
    await expect(material.getByRole("heading", { name: "Find the material for this lesson", exact: true })).toBeVisible();
    await iframe.evaluate(element => { element.dataset.continuity = "same-deck"; });
    for (const [index, answer] of ["sidebar", "hint", "agent", "yes", "auto"].entries()) {
      await surface.getByRole("button", { name: "Next slide", exact: true }).click();
      await material.getByRole("textbox", { name: "Your answer", exact: true }).fill(answer);
      await material.getByRole("button", { name: "Check answer", exact: true }).click();
      await surface.getByRole("button", { name: "Finish lesson", exact: true }).click();
      await expect(material.getByRole("heading", { name: index === 4 ? "Course complete" : "Lesson complete", exact: true })).toBeVisible();
      if (index < 4) await surface.getByRole("button", { name: "Next lesson", exact: true }).click();
    }
    await expect(page).toHaveURL(sessionUrl);
    expect(await sidebarLessons.allTextContents()).toEqual(lessonTitles);
    await expect(iframe).toHaveAttribute("data-continuity", "same-deck");
    await page.reload();
    await expect(material.getByRole("heading", { name: "Course complete", exact: true })).toBeVisible();
    await expect(material.locator("[data-slidev-no]:visible")).toHaveCount(1);
    await expect.poll(() => material.getByRole("heading", { name: "Course complete", exact: true }).evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    })).toBe(true);
    await expect.poll(() => material.getByRole("heading", { name: "Course complete", exact: true }).evaluate(element =>
      getComputedStyle(element.closest("[data-slidev-no]")!).transform)).toBe("none");
    await expect.poll(() => material.locator("body").evaluate(() =>
      document.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
    await page.screenshot({ path: info.outputPath("course-finished-slide.png") });
    await surface.getByRole("button", { name: "Back to courses", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your courses", exact: true })).toBeVisible();
    await page.locator('.ui-as-side a[href="/explore"]').click();
    await expect(page.getByRole("heading", { name: "Find your next course", exact: true })).toBeVisible();
    refreshReady = new Promise<void>(resolve => { releaseRefresh = resolve; });
    await page.locator('.ui-as-side a[href="/"]').last().click();
    await expect(page.getByRole("heading", { name: "Your courses", exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: "Starting Dojo", exact: true })).toHaveCount(0);
    releaseRefresh();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your courses", exact: true })).toBeVisible();
    await expect(page.locator(".ui-as-app")).toBeVisible();
    await expect(page.locator(".ui-card:not(.ui-card--add)")).toHaveCount(4);
    await expect(page.locator(".ui-card__figure")).toHaveCount(4);
    await expect(page.getByText("Alex Morgan", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Your courses" })).toHaveCSS("font-family", /Inter/);
    await page.getByRole("button", { name: /^Language:/ }).click();
    await page.getByRole("menuitemradio", { name: "Python", exact: true }).click();
    const python = courses.find(course => course.workspaceName === "beta")!;
    await expect(page.locator(".ui-card:not(.ui-card--add)")).toHaveCount(1);
    await expect(page.locator("a.ui-card")).toHaveAttribute("href", `/learn/${python.runId}`);
    await page.getByRole("button", { name: /^Language:/ }).click();
    await page.getByRole("menuitemradio", { name: "All languages", exact: true }).click();
    await page.getByRole("button", { name: /^Search$/, exact: true }).click();
    const palette = page.getByRole("dialog", { name: "Search your courses", exact: true });
    await expect(palette).toBeVisible();
    await palette.getByRole("combobox").fill("library");
    await page.evaluate(() => { (window as typeof window & { routeSnapshots: unknown[] }).routeSnapshots = []; });
    await palette.getByRole("option", { name: /library course/i }).click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { routeSnapshots: Array<{ menu: string; course: boolean }> }).routeSnapshots.some(snapshot => snapshot.course && snapshot.menu.includes("Library Course")))).toBe(true);
    await expect(page).toHaveURL(`${origin}/learn/${courses.find(course => course.dojo === "library-course")!.runId}`);
    await expect(page.getByRole("dialog", { name: /Continue library course/i })).toHaveCount(0);
    await page.goto(origin);
    await expect(page.getByRole("heading", { name: "Your courses", exact: true })).toBeVisible();
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
    await page.setViewportSize({ width: 1440, height: 900 });
    const remaining = await page.request.get(`${origin}/api/control/courses`).then(response => response.json());
    for (const course of remaining) execFileSync(process.execPath, [cli, "remove", course.dojo], { cwd: workspaces[0], env: environment, stdio: "pipe" });
    await page.reload();
    await expect(page.getByText("No courses yet", { exact: true })).toBeVisible();
    await expect(page.locator(".ui-card:not(.ui-card--add)")).toHaveCount(0);
    await page.getByRole("button", { name: "Explore courses", exact: true }).click();
    await page.getByRole("button", { name: "Details Create your own dojo", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/course/create-your-own-dojo`);
    await expect(page.getByRole("heading", { name: "Create your own dojo", exact: true })).toBeVisible();
    await expect(page.getByTestId("interactive-material")).toHaveCount(0);
    expect(await page.request.get(`${origin}/api/control/courses`).then(response => response.json())).toEqual([]);
    await page.screenshot({ path: info.outputPath("uninstalled-course-preview.png") });
    await page.locator('.ui-as-side a[href="/"]').last().click();
    await expect(page.getByText("No courses yet", { exact: true })).toBeVisible();
    await page.goto(`${origin}/course/create-your-own-dojo`);
    const installation = page.waitForResponse(response => response.url().endsWith("/api/control/starters/create-your-own-dojo/install") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Install course", exact: true }).click();
    expect((await installation).status()).toBe(201);
    const created = await page.request.get(`${origin}/api/control/courses/create-your-own-dojo`).then(response => response.json());
    await expect(page).toHaveURL(`${origin}/learn/${created.runId}`);
    await expect(page.getByTestId("interactive-material")).toBeVisible();
    await page.goto(`${origin}/course/create-your-own-dojo`);
    await expect(page).toHaveURL(`${origin}/learn/${created.runId}`);
    await page.reload();
    await expect(page.getByTestId("interactive-material")).toBeVisible();
    await expect(page.getByRole("group", { name: "Dashboard", exact: true })).toHaveCount(0);
    await page.locator('.ui-as-chat__crumbs').getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(page.getByRole("link", { name: /^Create your own dojo, / })).toBeVisible();
    const sessions = await page.request.get(`${origin}/api/control/sessions`).then(response => response.json()) as Array<{ ownership: string }>;
    // CLI commands may observe the calling agent's external session. Browsing
    // must never start or adopt a managed/owned teaching conversation.
    expect(sessions.filter(session => session.ownership !== "external")).toEqual([]);
    const draftResponse = await page.request.post(`${origin}/api/control/authoring`, { data: { name: "Collapse test" } });
    expect(draftResponse.status()).toBe(201);
    const draft = await draftResponse.json();
    await mountAgentChat(page, { root: draft.path, workspaceId: draft.workspaceId, files: false });
    await page.goto(`${origin}/authoring?workspace=${draft.workspaceId}&session=saved`);
    const authoringTree = page.getByRole("tree", { name: "Course files and chapters", exact: true });
    await expect(authoringTree).toBeVisible();
    await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
    await expect(authoringTree).toBeHidden();
    await expect(page.getByLabel("Course card preview", { exact: true })).toBeHidden();
    await expect(page.locator("aside.ui-as-side")).toHaveCSS("width", "64px");
    await expect(page.locator("aside.ui-as-side").getByRole("button", { name: "Evals", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
    await expect(authoringTree).toBeHidden();
    await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
    await expect(authoringTree.getByRole("treeitem", { name: "Default", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.getByRole("button", { name: "Actions for Collapse test", exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("button", { name: "Actions for Collapse test", exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  } catch (error) {
    await page.screenshot({ path: info.outputPath("library-failure.png") });
    throw error;
  } finally {
    releaseSetup();
    releaseRefresh();
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
