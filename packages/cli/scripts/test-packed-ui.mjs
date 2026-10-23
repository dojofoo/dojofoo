import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(cliRoot, "../..");
const expectedPackage = JSON.parse(readFileSync(resolve(cliRoot, "package.json"), "utf8"));
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

  // Install local runtime dependencies as tarballs too. They are not all
  // published, and registry copies would test a different implementation.
  for (const packageName of ["config", "agent", "authoring"]) {
    pack(resolve(workspaceRoot, "packages", packageName), packs);
  }
  pack(cliRoot, packs);
  const tarballs = readdirSync(packs).map((name) => resolve(packs, name));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-package-lock", ...tarballs], {
    cwd: installRoot,
    stdio: "pipe",
  });

  const installedRequire = createRequire(resolve(installRoot, "package.json"));
  const { scaffoldAuthoringWorkspace } = await import(
    pathToFileURL(installedRequire.resolve("@dojofoo/authoring/scaffold")).href
  );
  const authorRoot = resolve(scratch, "author");
  scaffoldAuthoringWorkspace({ root: authorRoot, name: "Packed course", style: "katas" });
  if (!readFileSync(resolve(authorRoot, ".gitignore"), "utf8").includes(".dojo/*") ||
      !readFileSync(resolve(authorRoot, "mise.toml"), "utf8").includes("[tasks.setup]") ||
      existsSync(resolve(authorRoot, "gitignore"))) {
    throw new Error("Packed authoring scaffold is missing its mise setup or private-state ignore rules.");
  }
  // Boot the shipped master from an npm installation, not workspace links.
  // Readiness compiles the agent but never makes a paid model call.
  mkdirSync(resolve(authorRoot, ".dojo/kyoshi"), { recursive: true });
  const { createKyoshiRuntime } = await import(
    pathToFileURL(installedRequire.resolve("@dojofoo/authoring/eve/runtime")).href
  );
  const previousHarness = process.env.DOJOFOO_HARNESS;
  const previousHome = process.env.DOJOFOO_HOME;
  process.env.DOJOFOO_HARNESS = "opencode";
  process.env.DOJOFOO_HOME = resolve(scratch, "home");
  let runtime;
  try {
    runtime = await createKyoshiRuntime(authorRoot);
    await runtime.start();
    console.log("Packed master authoring agent passed readiness without a model call.");
  } finally {
    await runtime?.close();
    if (previousHarness === undefined) delete process.env.DOJOFOO_HARNESS;
    else process.env.DOJOFOO_HARNESS = previousHarness;
    if (previousHome === undefined) delete process.env.DOJOFOO_HOME;
    else process.env.DOJOFOO_HOME = previousHome;
  }

  const installedPackage = JSON.parse(
    readFileSync(resolve(installRoot, "node_modules/dojofoo/package.json"), "utf8"),
  );
  if (installedPackage.name !== expectedPackage.name || installedPackage.version !== expectedPackage.version) {
    throw new Error(
      `Expected packed ${expectedPackage.name}@${expectedPackage.version}, received ${installedPackage.name}@${installedPackage.version}.`,
    );
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
  if (!help.includes("Usage: npx dojofoo") || !help.includes("install [--agent]") || !help.includes("ui [--background]") || !help.includes("https://dojo.localhost")) {
    throw new Error("Packed dojofoo executable does not advertise its install command and default UI URL.");
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
