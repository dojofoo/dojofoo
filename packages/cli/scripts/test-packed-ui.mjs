import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(cliRoot, "../..");
const configRoot = resolve(workspaceRoot, "packages/config");
const scratch = mkdtempSync(resolve(tmpdir(), "dojo-packed-install-"));
const packs = resolve(scratch, "packs");
const installRoot = resolve(scratch, "install");
const projectRoot = resolve(scratch, "project");
let child;
let output = "";
let spawnError;

try {
  mkdirSync(packs, { recursive: true });
  mkdirSync(installRoot, { recursive: true });
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(resolve(installRoot, "package.json"), JSON.stringify({ private: true }));

  pack(configRoot, packs);
  pack(cliRoot, packs);
  const tarballs = readdirSync(packs).map((name) => resolve(packs, name));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-package-lock", ...tarballs], {
    cwd: installRoot,
    stdio: "pipe",
  });

  const installedPackage = JSON.parse(
    readFileSync(resolve(installRoot, "node_modules/dojofoo/package.json"), "utf8"),
  );
  if (installedPackage.name !== "dojofoo" || installedPackage.version !== "0.0.1") {
    throw new Error(`Expected packed dojofoo@0.0.1, received ${installedPackage.name}@${installedPackage.version}.`);
  }
  if (installedPackage.bin?.dojofoo !== "./dist/index.js") {
    throw new Error("Packed package does not expose the dojofoo executable.");
  }
  if (existsSync(resolve(installRoot, "node_modules/.bin/dojo"))) {
    throw new Error("Packed package still exposes the legacy dojo executable.");
  }
  if (existsSync(resolve(installRoot, "node_modules/.bin/dojos"))) {
    throw new Error("Packed package still exposes the rejected dojos executable.");
  }

  const port = await availablePort();
  const executable = resolve(installRoot, "node_modules/.bin/dojofoo");
  const help = execFileSync(executable, ["--help"], { encoding: "utf8" });
  if (!help.includes("Usage: npx dojofoo") || !help.includes("install [--agent]") || !help.includes("ui [--background]")) {
    throw new Error("Packed dojofoo executable does not advertise its install and UI commands.");
  }
  child = spawn(executable, ["ui", "--no-open"], {
    cwd: projectRoot,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      DOJO_PROJECT_ROOT: projectRoot,
      DOJO_UI_DISABLE_PORTLESS: "1",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  child.once("error", (error) => { spawnError = error; });

  const response = await waitForServer(`http://127.0.0.1:${port}`);
  const html = await response.text();
  if (response.status !== 200 || !html.toLowerCase().includes("<!doctype html")) {
    throw new Error(`Packed dojo UI returned ${response.status} without an HTML document.`);
  }
  console.log(`Packed dojo UI responded with HTTP ${response.status}.`);
} catch (error) {
  if (output) process.stderr.write(output);
  throw error;
} finally {
  if (child?.pid) {
    try {
      process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGTERM");
    } catch {
      // The server may already have exited and reported its failure above.
    }
  }
  rmSync(scratch, { recursive: true, force: true });
}

function pack(packageRoot, destination) {
  execFileSync("pnpm", ["pack", "--pack-destination", destination], {
    cwd: packageRoot,
    stdio: "pipe",
  });
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (child?.exitCode !== null) {
      throw new Error(`Packed dojo UI exited before startup with code ${child?.exitCode}.`);
    }
    try {
      return await fetch(url);
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  throw new Error("Timed out waiting for the packed dojo UI to start.");
}
