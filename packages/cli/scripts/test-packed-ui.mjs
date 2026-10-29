import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedPackage = JSON.parse(readFileSync(resolve(cliRoot, "package.json"), "utf8"));
const scratch = realpathSync(mkdtempSync(resolve(tmpdir(), "dojo-packed-install-")));
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
  writeFileSync(resolve(projectRoot, ".dojorc"), JSON.stringify({ currentDojo: "", currentKata: null, editor: null }));
  writeFileSync(resolve(installRoot, "package.json"), JSON.stringify({ private: true }));

  // The public CLI must carry its private workspace runtime by itself.
  pack(cliRoot, packs);
  const tarballs = readdirSync(packs).map((name) => resolve(packs, name));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-package-lock", ...tarballs], {
    cwd: installRoot,
    stdio: "inherit",
    timeout: 300_000,
  });

  const installedRequire = createRequire(resolve(installRoot, "node_modules/dojofoo/package.json"));
  const label = JSON.parse(readFileSync(resolve(dirname(installedRequire.resolve("@dojofoo/authoring/package.json")), "dist/prepared/kyoshi/build.json"), "utf8"));
  if (label.dojofoo !== `dojofoo@${expectedPackage.version}` || !label.sourceHash) {
    throw new Error("The installed Kyoshi build is missing its release and source labels.");
  }
  // Preserve the original adapter's assets beside its module. Model switching
  // is exercised by the production turn test, without extracting private code.
  const adapter = dirname(installedRequire.resolve("@ai-sdk/harness-opencode"));
  for (const asset of ["index.mjs", "host-tool-mcp.mjs", "package.json"]) {
    if (!existsSync(resolve(adapter, "bridge", asset))) throw new Error(`Installed OpenCode adapter is missing ${asset}.`);
  }
  const { createOpenCode } = await import(pathToFileURL(installedRequire.resolve("@ai-sdk/harness-opencode")).href);
  // Let the adapter resolve its own version's physical asset filenames.
  const bootstrap = await createOpenCode().getBootstrap();
  if (!bootstrap.files.some(file => file.path.endsWith("/patches/@opencode-ai__sdk@1.18.34.patch"))) {
    throw new Error("The packed OpenCode adapter lost its native server shutdown patch.");
  }
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
  // Readiness uses the release-built agent without compiling or sending a prompt.
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
  const help = execFileSync(executable, ["--help"], { encoding: "utf8", env: { ...process.env, DOJOFOO_HOME: resolve(scratch, "home") } });
  if (!help.includes("Usage: npx dojofoo") || !help.includes("install [--agent]") || !help.includes("ui [--background]") || !help.includes("https://dojo.localhost")) {
    throw new Error("Packed dojofoo executable does not advertise its install command and default UI URL.");
  }
  child = spawn(executable, ["ui", "--no-open"], {
    cwd: projectRoot,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      // srvx disables its production shutdown handlers under CI/TEST.
      CI: "",
      TEST: "",
      DOJO_PROJECT_ROOT: projectRoot,
      DOJOFOO_HOME: resolve(scratch, "home"),
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
  const base = `http://127.0.0.1:${port}`;
  const workspaces = await (await fetch(`${base}/api/control/workspaces`)).json();
  const workspace = workspaces.find(item => item.path === realpathSync(projectRoot));
  if (!workspace) throw new Error("The packed CLI did not register its workspace.");
  for (const courseId of ["create-your-own-dojo", "how-to-run-a-dojo"]) {
    const installed = await fetch(`${base}/api/control/starters/${courseId}/install`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: workspace.id }),
    });
    if (installed.status !== 201) throw new Error(`Packed starter installation failed (${installed.status}): ${await installed.text()}`);
    const resource = `${base}/api/workspaces/${workspace.id}/courses/${courseId}/interactive`;
    const material = await (await fetch(resource)).json();
    if (material.dojo !== courseId || material.current?.type !== "present") throw new Error(`Packed ${courseId} has no first learning material.`);
    const conversation = await (await fetch(`${resource}/conversation`)).json();
    if (conversation.sessionId !== null) throw new Error("Opening a starter unexpectedly created an agent session.");
    console.log(`Packed starter ${courseId}: installed, first material available, no agent session.`);
  }
} catch (error) {
  if (output) process.stderr.write(output);
  throw error;
} finally {
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "close", { signal: AbortSignal.timeout(10_000) });
    try {
      process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGTERM");
      await exited;
    } catch (error) {
      try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); }
      catch { /* The process may already be gone. */ }
      throw new Error(`Packed UI did not shut down cleanly: ${output}`, { cause: error });
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
