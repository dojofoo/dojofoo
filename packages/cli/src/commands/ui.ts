import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dojoDir, findManifestPath, readDojoRc } from "../config";

/** Author the requested course, not its enclosing multi-course workspace. */
export function resolveAuthoringRoot(cwd: string, workspace: string): string {
  if (findManifestPath(cwd)) return cwd;
  try {
    const { currentDojo } = readDojoRc(workspace);
    if (currentDojo) {
      const course = dojoDir(workspace, currentDojo);
      if (findManifestPath(course)) return course;
    }
  } catch {
    // A standalone draft can be opened before workspace registration.
  }
  return cwd;
}

export async function ui(cwd: string, args: string[]): Promise<void> {
  if (args.includes("--skill")) {
    const skill = resolveUiSkill();
    if (!skill) throw new Error("Could not locate the bundled Dojofoo UI skill.");
    process.stdout.write(readFileSync(skill, "utf8"));
    return;
  }
  const uiEntry = resolveUiEntry();
  if (!uiEntry) {
    console.error("Could not locate the bundled dojo UI server.");
    process.exit(1);
  }

  const name = valueAfter(args, "--name") ?? process.env.DOJO_UI_NAME ?? "dojo";
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(name)) {
    throw new Error(`Invalid dojo UI name: ${name}`);
  }
  const background = args.includes("--background");
  const shouldOpen = !args.includes("--no-open");
  const openPath = resolveUiOpenPath(args);
  const tld = valueAfter(args, "--tld");
  const port = valueAfter(args, "--port") ?? process.env.PORT ?? process.env.DOJO_UI_PORT ?? "4567";
  if (!/^\d+$/u.test(port) || Number(port) < 1 || Number(port) > 65_535) {
    throw new Error(`Invalid dojo UI port: ${port}`);
  }

  if (!args.includes("--no-portless") && process.env.DOJO_UI_DISABLE_PORTLESS !== "1" && hasCommand("portless")) {
    // The UI is a disposable daemon. Always replace an existing route so a
    // newly installed CLI cannot keep serving HTML from an older asset manifest.
    const portlessArgs = ["--name", name, "--force"];
    if (tld) portlessArgs.push("--tld", tld);
    portlessArgs.push("--", process.execPath, uiEntry);
    const child = spawn("portless", portlessArgs, {
      cwd,
      env: { ...process.env, DOJO_CLI: process.argv[1] },
      stdio: background ? "ignore" : "inherit",
      detached: background,
    });
    if (background) {
      let fellBack = false;
      const fallback = (reason: string) => {
        if (fellBack) return;
        fellBack = true;
        console.warn(`Portless ${reason}; falling back to http://localhost:${port}.`);
        startDirectUi({ cwd, uiEntry, port, background, shouldOpen, openPath });
      };
      child.once("error", (error) => fallback(`could not start (${error.message})`));
      child.once("exit", (code) => {
        if (code && code !== 0) fallback(`exited with status ${code}`);
      });
      setTimeout(() => {
        if (fellBack) return;
        const baseUrl = activePortlessUrl(name);
        const url = baseUrl ? `${baseUrl}${openPath}` : null;
        if (url) {
          console.log(url);
          if (shouldOpen) openBrowser(url);
          child.unref();
        } else {
          child.kill();
          fallback("did not register a route");
        }
      }, 2_000);
      return;
    }
    relayExit(child, () => {
      console.warn(`Portless failed; falling back to http://localhost:${port}.`);
      startDirectUi({ cwd, uiEntry, port, background, shouldOpen, openPath });
    });
    return;
  }

  startDirectUi({ cwd, uiEntry, port, background, shouldOpen, openPath });
}

function startDirectUi(input: {
  cwd: string;
  uiEntry: string;
  port: string;
  background: boolean;
  shouldOpen: boolean;
  openPath: string;
}): void {
  const { cwd, uiEntry, port, background, shouldOpen, openPath } = input;
  const url = `http://localhost:${port}${openPath}`;
  const pidFile = directUiPidFile(port);
  replaceDirectDaemon(pidFile, uiEntry);
  console.log(url);
  const child = spawn(process.execPath, [uiEntry], {
    cwd,
    env: { ...process.env, DOJO_CLI: process.argv[1], PORT: port },
    stdio: background ? "ignore" : "inherit",
    detached: background,
  });
  mkdirSync(dirname(pidFile), { recursive: true });
  writeFileSync(pidFile, JSON.stringify({ pid: child.pid, uiEntry }));
  child.once("exit", () => {
    try {
      const current = JSON.parse(readFileSync(pidFile, "utf8")) as { pid?: number };
      if (current.pid === child.pid) rmSync(pidFile, { force: true });
    } catch {
      // Another invocation may already have replaced and removed this record.
    }
  });
  if (background) child.unref();
  else relayExit(child);
  if (shouldOpen) openBrowser(url);
}

function directUiPidFile(port: string): string {
  const stateHome = process.env.DOJOFOO_HOME ?? join(homedir(), ".dojofoo");
  return join(stateHome, `ui-${port}.pid`);
}

function replaceDirectDaemon(pidFile: string, uiEntry: string): void {
  try {
    const record = JSON.parse(readFileSync(pidFile, "utf8")) as { pid?: number; uiEntry?: string };
    if (record.uiEntry !== uiEntry || !Number.isInteger(record.pid) || !record.pid) return;
    // Background UI servers are process-group leaders. Terminate the explicit
    // group so lesson-scoped ACP runtimes cannot outlive the daemon that owns
    // them and retain native sessions after a rebuild.
    process.kill(process.platform === "win32" ? record.pid : -record.pid, "SIGTERM");
  } catch {
    // Missing/stale records are expected after a crash or the first launch.
  } finally {
    rmSync(pidFile, { force: true });
  }
}

function activePortlessUrl(name: string): string | null {
  try {
    const output = execFileSync("portless", ["list"], { encoding: "utf8" });
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return output.match(new RegExp(`https?://${escaped}\\.[^\\s]+`))?.[0] ?? null;
  } catch {
    return null;
  }
}

function hasCommand(command: string): boolean {
  try {
    execFileSync(command, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(command, args, { stdio: "ignore", detached: true }).unref();
}

function relayExit(child: ReturnType<typeof spawn>, onFailure?: () => void): void {
  let handled = false;
  const fail = () => {
    if (handled) return;
    handled = true;
    if (onFailure) onFailure();
    else process.exit(1);
  };
  child.on("error", (error) => {
    console.error(`Failed to launch dojo UI: ${error.message}`);
    fail();
  });
  child.on("exit", (code, signal) => {
    if (handled) return;
    handled = true;
    if (signal) process.kill(process.pid, signal);
    else if (code && onFailure) onFailure();
    else process.exit(code ?? 0);
  });
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

export function resolveUiOpenPath(args: string[]): string {
  return args.includes("--authoring") ? "/authoring" : "";
}

export function resolveUiEntry(moduleUrl = import.meta.url): string | null {
  const dir = dirname(fileURLToPath(moduleUrl));
  const candidates = [
    join(dir, "ui", "server", "index.mjs"),
    join(dir, "..", "..", "..", "..", "apps", "ui", ".output", "server", "index.mjs"),
  ];
  return candidates.find(existsSync) ?? null;
}

export function resolveUiSkill(moduleUrl = import.meta.url): string | null {
  const dir = dirname(fileURLToPath(moduleUrl));
  const candidates = [
    join(dir, "..", "skills", "dojofoo", "SKILL.md"),
    join(dir, "..", "..", "skills", "dojofoo", "SKILL.md"),
  ];
  return candidates.find(existsSync) ?? null;
}
