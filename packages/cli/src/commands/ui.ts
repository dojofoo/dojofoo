import { existsSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function ui(_cwd: string, args: string[]): void {
  const uiDir = resolveUiDir();
  if (!uiDir) {
    console.error("Could not locate the bundled dojo UI.");
    process.exit(1);
  }

  const name = valueAfter(args, "--name") ?? process.env.DOJO_UI_NAME ?? "dojo";
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(name)) {
    throw new Error(`Invalid dojo UI name: ${name}`);
  }
  const background = args.includes("--background");
  const shouldOpen = !args.includes("--no-open");
  const tld = valueAfter(args, "--tld");

  if (hasCommand("portless")) {
    const active = activePortlessUrl(name);
    if (active) {
      console.log(active);
      if (shouldOpen) openBrowser(active);
      return;
    }

    const portlessArgs = ["--name", name];
    if (tld) portlessArgs.push("--tld", tld);
    portlessArgs.push("--", "pnpm", "dev");
    const child = spawn("portless", portlessArgs, {
      cwd: uiDir,
      env: process.env,
      stdio: background ? "ignore" : "inherit",
      detached: background,
    });
    if (background) {
      child.unref();
      setTimeout(() => {
        const url = activePortlessUrl(name);
        if (url) {
          console.log(url);
          if (shouldOpen) openBrowser(url);
        }
      }, 1_000);
      return;
    }
    relayExit(child);
    return;
  }

  const port = process.env.PORT ?? process.env.DOJO_UI_PORT ?? "4567";
  const url = `http://localhost:${port}`;
  console.log(url);
  const child = spawn("pnpm", ["dev"], {
    cwd: uiDir,
    env: { ...process.env, PORT: port },
    stdio: background ? "ignore" : "inherit",
    detached: background,
  });
  if (background) child.unref();
  else relayExit(child);
  if (shouldOpen) openBrowser(url);
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

function relayExit(child: ReturnType<typeof spawn>): void {
  child.on("error", (error) => {
    console.error(`Failed to launch dojo UI: ${error.message}`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function resolveUiDir(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "apps", "ui");
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
