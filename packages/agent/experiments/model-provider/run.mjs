import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Deliberately outside the workspace: no pnpm patches, aliases or source checkout.
const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-unpatched-provider-")));
const cliOnly = process.argv.includes("--cli-only");
const hostOnly = process.argv.includes("--host-only");
const versions = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const authoringVersions = JSON.parse(await readFile(new URL("../../../authoring/package.json", import.meta.url), "utf8"));
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
  for (const name of ["ui", "evals"]) {
    const consumer = JSON.parse(await readFile(new URL(`../../../${name}/package.json`, import.meta.url), "utf8"));
    for (const dependency of ["ai", "@ai-sdk/harness"]) {
      assert.equal(consumer.dependencies[dependency], dependencies[dependency], `${name} must test the production ${dependency}`);
    }
  }
  dependencies.pnpm = "10.34.5";
  dependencies["@tanstack/ai"] = authoringVersions.dependencies["@tanstack/ai"];
  dependencies["@tanstack/ai-client"] = authoringVersions.devDependencies["@tanstack/ai-client"];
  dependencies.hono = "4.13.1";
  dependencies.tsx = "4.21.0";
  // Use production adapter pins for the clean consumer too, rather than a
  // second, independently maintained version matrix.
  for (const [name, version] of Object.entries(authoringVersions.dependencies)) {
    if (!name.startsWith("@ai-sdk/harness-")) continue;
    if (dependencies[name]) assert.equal(dependencies[name], version, `${name} must match authoring`);
    dependencies[name] = version;
  }
  // Additional compile-only adapters; these are never started or authenticated.
  for (const [adapter, version] of Object.entries({
    "claude-code": "1.0.157", cline: "1.0.80", deepagents: "1.0.153",
    "github-copilot": "1.0.49",
  })) {
    dependencies[`@ai-sdk/harness-${adapter}`] = version;
  }
  const [packed] = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", root], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8",
  }));
  assert.ok(packed.files.every(({ path }) => path.startsWith("dist/") || path.startsWith("patches/") || ["package.json", "README.md"].includes(path)));
  assert.ok(packed.files.some(({ path }) => path === `patches/eve@${versions.devDependencies.eve}.patch`));
  const localPackages = { "@dojofoo/agent": `file:./${packed.filename}` };
  for (const name of ["authoring", "config"]) {
    const artifact = JSON.parse(execFileSync("pnpm", ["pack", "--json", "--pack-destination", root], {
      cwd: fileURLToPath(new URL(`../../../${name}/`, import.meta.url)), encoding: "utf8",
    }));
    localPackages[artifact.name] = `file:${artifact.filename}`;
  }
  await writeFile(join(root, "package.json"), JSON.stringify({ private: true, type: "module", dependencies: {
    ...dependencies, ...localPackages,
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
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org"]);
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
