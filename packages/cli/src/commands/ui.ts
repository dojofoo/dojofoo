import { existsSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function ui(cwd: string, args: string[]): void {
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
  const tld = valueAfter(args, "--tld");

  if (process.env.DOJO_UI_DISABLE_PORTLESS !== "1" && hasCommand("portless")) {
    const active = activePortlessUrl(name);
    if (active) {
      console.log(active);
      if (shouldOpen) openBrowser(active);
      return;
    }

    const portlessArgs = ["--name", name];
    if (tld) portlessArgs.push("--tld", tld);
    portlessArgs.push("--", process.execPath, uiEntry);
    const child = spawn("portless", portlessArgs, {
      cwd,
      env: { ...process.env, DOJO_CLI: process.argv[1] },
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
  const child = spawn(process.execPath, [uiEntry], {
    cwd,
    env: { ...process.env, DOJO_CLI: process.argv[1], PORT: port },
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

export function resolveUiEntry(moduleUrl = import.meta.url): string | null {
  const dir = dirname(fileURLToPath(moduleUrl));
  const candidates = [
    join(dir, "ui", "server", "index.mjs"),
    join(dir, "..", "..", "..", "..", "apps", "ui", ".output", "server", "index.mjs"),
  ];
  return candidates.find(existsSync) ?? null;
}
