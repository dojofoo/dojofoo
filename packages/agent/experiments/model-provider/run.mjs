import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Deliberately outside the workspace: no pnpm patches, aliases or source checkout.
const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-unpatched-provider-")));
const cliOnly = process.argv.includes("--cli-only");
const hostOnly = process.argv.includes("--host-only");
const versions = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: root, stdio: "inherit", env: { ...process.env, NODE_OPTIONS: "" },
  });
  child.on("error", reject);
  child.on("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${command}: ${code ?? signal}`)));
});
try {
  const dependencies = Object.fromEntries(["ai", "@ai-sdk/harness"].map(name => [name, versions.dependencies[name]]));
  dependencies["@ai-sdk/sandbox-just-bash"] = versions.devDependencies["@ai-sdk/sandbox-just-bash"];
  dependencies["@ai-sdk/harness-pi"] = versions.devDependencies["@ai-sdk/harness-pi"];
  dependencies.pnpm = "10.34.5";
  dependencies["@tanstack/ai"] = "0.47.1";
  dependencies["@tanstack/ai-client"] = "0.25.1";
  dependencies.hono = "4.13.1";
  dependencies.tsx = "4.21.0";
  // Compile-only compatibility matrix; these adapters are never started.
  for (const [adapter, version] of Object.entries({
    "claude-code": "1.0.112", cline: "1.0.35", codex: "1.0.110",
    cursor: "1.0.21", deepagents: "1.0.108", fx: "1.0.21",
    "github-copilot": "1.0.3", "grok-build": "1.0.45", opencode: "1.0.110",
  })) {
    dependencies[`@ai-sdk/harness-${adapter}`] = version;
  }
  const [packed] = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", root], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8",
  }));
  assert.ok(packed.files.every(({ path }) => path.startsWith("dist/") || path.startsWith("patches/") || ["package.json", "README.md"].includes(path)));
  assert.ok(packed.files.some(({ path }) => path === "patches/eve@0.53.0.patch"));
  await writeFile(join(root, "package.json"), JSON.stringify({ private: true, type: "module", dependencies: {
    ...dependencies, "@dojofoo/agent": `file:./${packed.filename}`,
  } }));
  await copyFile(new URL("provider.test.mjs", import.meta.url), join(root, "provider.test.mjs"));
  await copyFile(new URL("recovery-worker.mjs", import.meta.url), join(root, "recovery-worker.mjs"));
  await copyFile(new URL("consumer-types.ts", import.meta.url), join(root, "consumer-types.ts"));
  await copyFile(new URL("adapter-types.ts", import.meta.url), join(root, "adapter-types.ts"));
  await copyFile(new URL("pi.test.mjs", import.meta.url), join(root, "pi.test.mjs"));
  await copyFile(new URL("opencode-startup.test.mjs", import.meta.url), join(root, "opencode-startup.test.mjs"));
  await copyFile(new URL("loopback-openai.mjs", import.meta.url), join(root, "loopback-openai.mjs"));
  for (const file of ["opencode-runtime.fixture.mjs", "opencode-recovery-worker.mjs"]) {
    await copyFile(new URL(file, import.meta.url), join(root, file));
  }
  await copyFile(new URL("authored.test.mjs", import.meta.url), join(root, "authored.test.mjs"));
  await copyFile(new URL("authored-agent.fixture.ts", import.meta.url), join(root, "authored-agent.fixture.ts"));
  await copyFile(new URL("host.test.mjs", import.meta.url), join(root, "host.test.mjs"));
  await copyFile(new URL("skills-host.test.mjs", import.meta.url), join(root, "skills-host.test.mjs"));
  await copyFile(new URL("native-host.test.mjs", import.meta.url), join(root, "native-host.test.mjs"));
  await copyFile(new URL("cli-host.test.mjs", import.meta.url), join(root, "cli-host.test.mjs"));
  await copyFile(new URL("host-agent.fixture.ts", import.meta.url), join(root, "host-agent.fixture.ts"));
  await copyFile(new URL("../../../authoring/src/sandbox.ts", import.meta.url), join(root, "authoring-sandbox.ts"));
  await mkdir(join(root, "authoring/src/eve"), { recursive: true });
  await mkdir(join(root, "authoring/src/contracts"));
  await copyFile(new URL("../../../authoring/package.json", import.meta.url), join(root, "authoring/package.json"));
  for (const path of ["eve/instructions.ts", "eve/ask.ts", "eve/routes.ts", "eve/resume.ts", "eve/messages.ts", "eve/stream.ts", "contracts/KYOSHI.md"]) {
    await copyFile(new URL(`../../../authoring/src/${path}`, import.meta.url), join(root, "authoring/src", path));
  }
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org"]);
  await symlink(join(root, "authoring"), join(root, "node_modules/@dojofoo/authoring"), "dir");
  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
  for (const [name, version] of Object.entries(dependencies)) {
    const entry = lock.packages[`node_modules/${name}`];
    assert.equal(entry.version, version);
    assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//);
    assert.ok(entry.integrity);
    assert.ok(!entry.link);
    if (name.startsWith("@ai-sdk/harness-")) {
      const adapter = JSON.parse(await readFile(join(root, "node_modules", name, "package.json"), "utf8"));
      assert.equal(adapter.dependencies["@ai-sdk/harness"], versions.dependencies["@ai-sdk/harness"],
        `${name} must target the tested HarnessAgent release`);
    }
  }
  assert.ok(!Object.keys(lock.packages).some(path => path.endsWith("node_modules/eve")));
  console.log("CLEAN_CONSUMER_DEPENDENCIES", dependencies);
  process.env.EVE_NATIVE_COMPACTION = "1";
  await run(process.execPath, [fileURLToPath(import.meta.resolve("typescript/bin/tsc")),
    "--noEmit", "--strict", "--skipLibCheck", "--target", "ES2023", "--module", "NodeNext", "consumer-types.ts", "adapter-types.ts"]);
  if (!cliOnly && !hostOnly) {
    await run(process.execPath, ["--test", "--test-timeout=30000", "provider.test.mjs"]);
    await run(process.execPath, ["--test", "--test-timeout=30000", "authored.test.mjs"]);
    await run(process.execPath, ["--test", "--test-timeout=30000", "pi.test.mjs"]);
    await run(process.execPath, ["--test", "--test-timeout=120000", "opencode-startup.test.mjs"]);
  }
  // All host scenarios use the already assembled runtime in the packed package.
  if (!cliOnly) {
    await run(process.execPath, ["--test", "--test-timeout=180000", "host.test.mjs"]);
  }
  if (!cliOnly && !hostOnly) {
    await run(process.execPath, ["--test", "--test-timeout=60000", "skills-host.test.mjs"]);
    await run(process.execPath, ["--test", "--test-timeout=180000", "native-host.test.mjs"]);
  }
  // The native provider still comes from the packed consumer; render the actual
  // workspace UI against that consumer's Eve host, without browser route mocks.
  process.env.DOJO_AGENT_UI_ROOT = fileURLToPath(new URL("../../../ui", import.meta.url));
  if (!hostOnly) await run(process.execPath, ["--import", "tsx", "--test", "--test-timeout=180000", "cli-host.test.mjs"]);
} finally {
  await rm(root, { recursive: true, force: true });
}
