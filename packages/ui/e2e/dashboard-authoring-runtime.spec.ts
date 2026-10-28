import { expect, test } from "@playwright/test";
import { execFileSync, fork } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

for (const entry of ["installed", "dashboard"] as const) test(entry === "installed"
  ? "the installed course opens native authoring through the CLI"
  : "the built dashboard creates two independent native authoring drafts and resumes them after restart", async ({ page }) => {
  test.skip(process.env.DOJO_AUTHORING_RUNTIME_E2E !== "1", "Opt-in native runtime; inference is loopback only.");
  test.setTimeout(300_000);
  const fixture = fork(fileURLToPath(new URL("../../authoring/src/eve/browser.fixture.mjs", import.meta.url)), [], {
    stdio: ["ignore", "pipe", "pipe", "ipc"], env: { ...process.env, DOJO_AUTHORING_ENTRY_FIXTURE: "1", DOJO_AUTHORING_REQUEST_LOG: test.info().outputPath("inference-requests.json") },
  });
  let logs = "";
  let fixtureRoot: string | undefined;
  fixture.stdout?.on("data", chunk => { logs += chunk; });
  fixture.stderr?.on("data", chunk => { logs += chunk; });
  const ready = async () => {
    if (fixture.exitCode !== null) throw new Error(logs);
    const [message] = await Promise.race([
      once(fixture, "message", { signal: AbortSignal.timeout(120_000) }),
      once(fixture, "exit").then(() => { throw new Error(`Fixture exited: ${logs}`); }),
    ]);
    expect(message.ready).toBe(true);
    return message as { url: string; course: string; root: string };
  };
  try {
    const { url, course, root } = await ready();
    fixtureRoot = root;
    const original = await readFile(join(course, "dojo.yaml"), "utf8");
    if (entry === "installed") {
      const began = performance.now();
      await page.goto(`${url}authoring`);
      await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeEnabled({ timeout: 30_000 });
      console.info(`Installed course: composer ready in ${Math.round(performance.now() - began)} ms.`);
      await expect(page.getByText("Ready to teach.", { exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(page).toHaveURL(/workspace=.+session=wrun_/);
      expect(await readFile(join(course, "dojo.yaml"), "utf8")).toBe(original);
      return;
    }
    const starts: string[] = [];
    page.on("request", request => {
      const match = new URL(request.url()).pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/sessions$/);
      if (request.method() === "POST" && match) starts.push(decodeURIComponent(match[1]!));
    });
    const create = async () => {
      await page.goto(url);
      const response = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/control/authoring");
      await page.getByRole("button", { name: /^New course/ }).click();
      const created = await response;
      expect(created.status()).toBe(201);
      const draft = await created.json() as { workspaceId: string; path: string };
      await expect(page).toHaveURL(/session=wrun_/, { timeout: 120_000 });
      await expect(page.getByText("Ready to teach.", { exact: true })).toBeVisible({ timeout: 120_000 });
      await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeEnabled();
      const session = new URL(page.url()).searchParams.get("session")!;
      expect(new URL(page.url()).searchParams.get("workspace")).toBe(draft.workspaceId);
      expect(await readFile(join(draft.path, "dojo.yaml"), "utf8")).toContain("name: New course");
      expect(await readFile(join(draft.path, ".dojo/config.yaml"), "utf8")).toContain("currentDojo");
      return { ...draft, session };
    };
    const first = await create();
    const second = await create();
    expect(first.path).not.toBe(second.path);
    expect(first.workspaceId).not.toBe(second.workspaceId);
    expect(first.session).not.toBe(second.session);
    expect(starts).toEqual([first.workspaceId, second.workspaceId]);
    const foreign = await page.request.get(`${url}api/v1/workspaces/${encodeURIComponent(second.workspaceId)}/sessions/${encodeURIComponent(first.session)}`);
    expect(foreign.status()).toBe(404);
    await page.screenshot({ path: test.info().outputPath("dashboard-created-authoring.png"), animations: "disabled" });
    const restarted = ready();
    fixture.send("restart");
    await restarted;
    await page.goto(url);
    const link = page.getByRole("region", { name: "Authoring", exact: true }).locator(`a[href*="workspace=${first.workspaceId}"]`);
    await expect(link).toHaveAttribute("href", new RegExp(`session=${first.session}`));
    await link.click();
    await expect(page).toHaveURL(new RegExp(`session=${first.session}`));
    await expect(page.getByText("Ready to teach.", { exact: true })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeEnabled();
    expect(starts).toEqual([first.workspaceId, second.workspaceId]);
    const snapshot = await page.request.get(`${url}api/v1/workspaces/${encodeURIComponent(first.workspaceId)}/sessions/${encodeURIComponent(first.session)}`);
    expect(snapshot.ok()).toBe(true);
    expect((await snapshot.json()).id).toBe(first.session);
    expect(await readFile(join(course, "dojo.yaml"), "utf8")).toBe(original);
  } finally {
    if (fixture.exitCode === null && fixture.signalCode === null) {
      const exited = once(fixture, "exit");
      fixture.kill("SIGTERM");
      await exited;
    }
    await writeFile(test.info().outputPath("runtime.log"), logs);
    expect.soft(logs, "The packaged Kyoshi instructions must reach the native agent").toContain('"shippedInstructionsLoaded":true');
    if (fixtureRoot) {
      const surviving = execFileSync("ps", ["-axo", "pid=,args="], { encoding: "utf8" }).split("\n").filter(line => line.includes(fixtureRoot!));
      expect.soft(surviving, "All owned native runtimes must close with the UI server").toEqual([]);
      for (const line of surviving) {
        const pid = Number(line.trim().split(/\s+/)[0]);
        if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("Invalid fixture process identity");
        try { process.kill(pid, "SIGTERM"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      }
    }
  }
});
