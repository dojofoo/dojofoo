import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createServer } from "node:net";
import { RouteStore, resolveUserHome } from "portless";
import { agentEnvironment } from "@dojofoo/config/agent-installations";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dojoDir, findManifestPath, readDojoRc } from "../config";
import { observeWorkspacePath } from "@dojofoo/config/local-state";

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

export async function ui(cwd: string, args: string[], moduleUrl = import.meta.url): Promise<void> {
  if (args.includes("--skill")) {
    const skill = resolveUiSkill();
    if (!skill) throw new Error("Could not locate the bundled Dojofoo UI skill.");
    process.stdout.write(readFileSync(skill, "utf8"));
    return;
  }
  const uiEntry = resolveUiEntry(moduleUrl);
  if (!uiEntry) {
    console.error("Could not locate the bundled dojo UI server.");
    process.exit(1);
  }

  const background = args.includes("--background");
  const shouldOpen = !args.includes("--no-open") && process.env.DOJO_UI_NO_OPEN !== "1";
  const openPath = resolveUiOpenPath(args);
  const draftId = args.includes("--authoring") ? observeWorkspacePath(process.env.DOJO_PROJECT_ROOT ?? cwd, { kind: "draft" }) : undefined;
  // A reused server reads bare /authoring as the folder it was started in, so it opens the draft by its address
  const reusePath = draftId ? `/authoring/${draftId}` : openPath;
  const version = packageVersion(moduleUrl);
  const port = valueAfter(args, "--port") ?? process.env.DOJO_UI_PORT ?? process.env.PORT ?? "4567";
  if (!/^\d+$/u.test(port) || Number(port) < 1 || Number(port) > 65_535) {
    throw new Error(`Invalid dojo UI port: ${port}`);
  }
  const environment: NodeJS.ProcessEnv = { ...agentEnvironment(), DOJO_CLI: process.argv[1], DOJO_PROJECT_ROOT: cwd, NODE_NO_WARNINGS: "1",
    DOJO_UI_VERSION: version };
  if (args.includes("--no-portless") || process.env.DOJO_UI_DISABLE_PORTLESS === "1") {
    const origin = `http://localhost:${port}`;
    if (await servesVersion(origin, version)) {
      console.log(`Go to ${origin}${reusePath}`);
      if (shouldOpen) openBrowser(`${origin}${reusePath}`);
      return;
    }
    startDirectUi({ cwd, uiEntry, port, background, shouldOpen, openPath, version });
    return;
  }
  const interactive = Boolean(process.stderr.isTTY);
  if (interactive) process.stderr.write("Starting Dojo…");
  const clearProgress = () => { if (interactive) process.stderr.write("\r\x1b[2K"); };
  let progressVisible = true;
  try {
    const stateDir = process.env.PORTLESS_STATE_DIR ?? join(resolveUserHome(), ".portless");
    let proxy = proxyConfiguration(stateDir);
    if (!await proxyRunning(proxy)) {
      const proxyEnvironment: NodeJS.ProcessEnv = { ...process.env, PORTLESS_STATE_DIR: stateDir };
      delete proxyEnvironment.npm_command;
      delete proxyEnvironment.PNPM_SCRIPT_SRC_DIR;
      await new Promise<void>((accept, reject) => {
        // Portless exports route/proxy primitives, but no daemon bootstrap API.
        // Use its included CLI only when the default shared proxy is absent.
        const bootstrap = spawn(process.execPath, [resolvePortlessEntry(), "proxy", "start"], {
          cwd, env: proxyEnvironment, stdio: ["inherit", "pipe", "pipe"],
        });
        let output = "";
        bootstrap.stdout.on("data", chunk => { output = (output + chunk).slice(-8000); });
        bootstrap.stderr.on("data", chunk => { output = (output + chunk).slice(-8000); });
        bootstrap.once("error", reject);
        bootstrap.once("exit", code => code === 0 ? accept() : reject(new Error(`Could not start Portless: ${output.trim()}`)));
      });
      proxy = proxyConfiguration(stateDir);
      if (!await proxyRunning(proxy)) throw new Error("Portless did not start its local proxy.");
    }
    const defaultPort = proxy.tls ? 443 : 80;
    const baseUrl = `${proxy.tls ? "https" : "http"}://dojo.localhost${proxy.port === defaultPort ? "" : `:${proxy.port}`}`;
    // A healthy server of this version keeps running and keeps its route: replacing it would stop its agent turns and evaluations
    if (await servesVersion(baseUrl, version, proxy.ca)) {
      clearProgress();
      progressVisible = false;
      console.log(`Go to ${baseUrl}${reusePath}`);
      if (shouldOpen) openBrowser(`${baseUrl}${reusePath}`);
      return;
    }
    const appPort = await availablePort();
    const stateHome = process.env.DOJOFOO_HOME ?? join(homedir(), ".dojofoo");
    mkdirSync(stateHome, { recursive: true });
    const logFile = join(stateHome, "ui.log");
    const log = openSync(logFile, "w", 0o600);
    const instance = crypto.randomUUID();
    const child = spawn(process.execPath, [uiEntry], {
      cwd, detached: true, stdio: ["ignore", log, log],
      env: { ...environment, PORT: String(appPort), HOST: "127.0.0.1", PORTLESS_URL: baseUrl,
        DOJO_UI_BASE_URL: baseUrl, DOJO_UI_INSTANCE: instance },
    });
    closeSync(log);
    let launchError: Error | undefined;
    child.once("error", error => { launchError = error; });
    const store = new RouteStore(stateDir);
    const cleanup = () => { if (child.pid) store.removeRoute("dojo.localhost", child.pid); };
    child.once("exit", cleanup);
    try {
      if (!child.pid) throw new Error("Could not start the local UI process.");
      // Exact hostname: no worktree/package-name inference or custom TLD rewrite.
      store.addRoute("dojo.localhost", appPort, child.pid, true);
      store.updateRoute("dojo.localhost", { childPgid: child.pid });
      await waitForUi(`${baseUrl}/api/health`, instance, proxy.ca, () => {
        if (launchError) throw launchError;
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error(`Local UI exited before startup. See ${logFile}.`);
        }
      });
    } catch (error) {
      child.kill();
      cleanup();
      throw error;
    }
    clearProgress();
    progressVisible = false;
    console.log(`Go to ${baseUrl}${openPath}`);
    if (shouldOpen) openBrowser(`${baseUrl}${openPath}`);
    if (background) child.unref();
    else {
      const interrupt = () => child.kill("SIGINT");
      const terminate = () => child.kill("SIGTERM");
      process.once("SIGINT", interrupt);
      process.once("SIGTERM", terminate);
      child.once("exit", () => {
        process.removeListener("SIGINT", interrupt);
        process.removeListener("SIGTERM", terminate);
      });
      relayExit(child);
    }
  } finally { if (progressVisible) clearProgress(); }
}

function proxyConfiguration(stateDir: string) {
  const portFile = join(stateDir, "proxy.port");
  const port = existsSync(portFile) ? Number(readFileSync(portFile, "utf8").trim()) : 443;
  const tls = existsSync(portFile) ? existsSync(join(stateDir, "proxy.tls")) : true;
  const caFile = join(stateDir, "ca.pem");
  return { port, tls, ca: existsSync(caFile) ? readFileSync(caFile) : undefined };
}

function proxyRunning(proxy: ReturnType<typeof proxyConfiguration>): Promise<boolean> {
  return new Promise(accept => {
    const request = (proxy.tls ? httpsRequest : httpRequest)({
      hostname: "127.0.0.1", port: proxy.port, path: "/", method: "HEAD",
      timeout: 1000, ...(proxy.tls ? { rejectUnauthorized: false } : {}),
    }, response => { response.resume(); accept(response.headers["x-portless"] === "1"); });
    request.on("error", () => accept(false));
    request.on("timeout", () => { request.destroy(); accept(false); });
    request.end();
  });
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()));
  return port;
}

type Health = { ok?: boolean; version?: string; instance?: string };

/** The UI's `/api/health` answer at `url`, asked of 127.0.0.1 under the URL's host; any status but 200 answers `{}`. */
function readHealth(url: string, ca: Buffer | undefined, timeout: number): Promise<Health> {
  const endpoint = new URL(url);
  return new Promise<Health>((accept, reject) => {
    const request = (endpoint.protocol === "https:" ? httpsRequest : httpRequest)({
      hostname: "127.0.0.1", port: endpoint.port || (endpoint.protocol === "https:" ? 443 : 80),
      path: endpoint.pathname, headers: { Host: endpoint.host }, timeout,
      ...(endpoint.protocol === "https:" ? { servername: endpoint.hostname, ca } : {}),
    }, response => {
      let body = "";
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => {
        try { accept(response.statusCode === 200 ? JSON.parse(body) : {}); } catch { accept({}); }
      });
    });
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error("UI health request timed out.")));
    request.end();
  });
}

/** Whether a healthy dojofoo UI of this version already serves `origin`. Without a known version of its own the CLI replaces any. */
async function servesVersion(origin: string, version: string | undefined, ca?: Buffer): Promise<boolean> {
  if (!version) return false;
  // A server running a lesson check answers only when the check ends, so a busy one gets time before it counts as unhealthy
  const health = await readHealth(`${origin}/api/health`, ca, 30_000).catch((): Health => ({}));
  return health.ok === true && health.version === version;
}

async function waitForUi(url: string, instance: string, ca: Buffer | undefined, check: () => void): Promise<void> {
  const endpoint = new URL(url);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    check();
    try {
      if ((await readHealth(url, ca, 1000)).instance === instance) return;
    } catch { /* The new route is still starting. */ }
    await new Promise(accept => setTimeout(accept, 100));
  }
  throw new Error(`Timed out starting ${endpoint.origin}.`);
}

function startDirectUi(input: {
  cwd: string;
  uiEntry: string;
  port: string;
  background: boolean;
  shouldOpen: boolean;
  openPath: string;
  version: string | undefined;
}): void {
  const { cwd, uiEntry, port, background, shouldOpen, openPath, version } = input;
  const url = `http://localhost:${port}${openPath}`;
  const pidFile = directUiPidFile(port);
  replaceDirectDaemon(pidFile, uiEntry);
  console.log(`Go to ${url}`);
  const child = spawn(process.execPath, [uiEntry], {
    cwd,
    env: { ...agentEnvironment(), DOJO_CLI: process.argv[1], DOJO_PROJECT_ROOT: cwd, NODE_NO_WARNINGS: "1", PORT: port,
      DOJO_UI_VERSION: version },
    stdio: "ignore",
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
  else {
    // As in the portless path: the UI stops its persona hosts before it exits, so this process waits for it
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    child.once("exit", () => {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", terminate);
    });
    relayExit(child);
  }
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

export function resolvePortlessEntry(): string {
  return join(dirname(fileURLToPath(import.meta.resolve("portless"))), "cli.js");
}

/** The version in the package.json beside the CLI's dist, whose UI it starts; unknown when run from source. */
function packageVersion(moduleUrl: string): string | undefined {
  try {
    return (JSON.parse(readFileSync(join(dirname(fileURLToPath(moduleUrl)), "..", "package.json"), "utf8")) as { version?: string }).version;
  } catch { return undefined; }
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
