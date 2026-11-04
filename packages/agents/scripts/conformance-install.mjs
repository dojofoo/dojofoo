// Installs each tier-A agent's pinned CLI through its adapter's own bootstrap recipe
// (docs/designs/agent-runtime.steps/step-3.md, "conformance-install.mjs"). Nothing is installed globally.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire, findPackageJSON } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { prepareHarnessEnvironment } from "@dojofoo/harness/adapters";
import { agentRow, agentRows, latestConformance, parseConformanceRecord } from "@dojofoo/protocol";

const execute = promisify(execFile);
const authoring = fileURLToPath(new URL("..", import.meta.url));
const load = createRequire(join(authoring, "package.json"));

/** Where tier A keeps its bootstrap homes, its reports and the committed record. */
export function conformancePaths(environment = process.env) {
  return {
    home: environment.DOJO_CONFORMANCE_HOME ?? join(tmpdir(), "dojofoo-conformance-home"),
    out: environment.DOJO_CONFORMANCE_OUT ?? join(authoring, ".conformance"),
    record: join(authoring, "../protocol/src/conformance.json"),
  };
}

/** The only variables a case, the host child and the Vitest processes start from; no credential travels into a case. */
export function caseBaseEnvironment(home = join(conformancePaths().home, "runner-home"), environment = process.env) {
  const { home: base } = conformancePaths(environment);
  const values = {
    PATH: environment.PATH, TMPDIR: environment.TMPDIR, LANG: environment.LANG,
    HOME: home, DOJOFOO_HOME: join(home, ".dojofoo"),
    MISE_DATA_DIR: join(base, "mise/data"), MISE_CACHE_DIR: join(base, "mise/cache"),
  };
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

/** Every registry row with an adapter except Cursor, or the DOJO_CONFORMANCE_AGENTS subset, in registry order. */
export function tierAAgents(environment = process.env) {
  const agents = agentRows.filter(row => row.adapterId && row.id !== "cursor").map(row => row.id);
  const subset = environment.DOJO_CONFORMANCE_AGENTS?.split(",").map(agent => agent.trim()).filter(Boolean);
  if (!subset?.length) return agents;
  const unknown = subset.filter(agent => !agents.includes(agent));
  if (unknown.length) throw new Error(`Not a tier-A agent: ${unknown.join(", ")}`);
  return agents.filter(agent => subset.includes(agent));
}

/** The CLI versions the first tier-A run expects, before the record has an entry for the agent. */
export const firstRunPins = { claude: "2.1.290", codex: "0.160.1", opencode: "1.18.34", grok: "1.0.49", fx: "0.0.14", pi: "1.3.0" };

const bootstrapped = {
  claude: { name: "@anthropic-ai/claude-code", dir: "claude-code", binary: "claude" },
  codex: { name: "@openai/codex", dir: "codex", binary: "codex" },
  opencode: { name: "opencode-ai", dir: "opencode", binary: "opencode" },
  grok: { name: "@xai-official/grok", dir: "grok-build", binary: "grok" },
};
const inProcess = { fx: "libfx", pi: "@earendil-works/pi-coding-agent" };

/** The adapter's version and the CLI it pins, read from the adapter's own files. */
export async function pinnedCli(agent) {
  const adapterPackage = `@ai-sdk/harness-${agentRow(agent).adapterId}`;
  const adapterJson = load.resolve(`${adapterPackage}/package.json`);
  const adapter = { package: adapterPackage, version: JSON.parse(await readFile(adapterJson, "utf8")).version };
  if (bootstrapped[agent]) {
    const { name, dir, binary } = bootstrapped[agent];
    const bridge = JSON.parse(await readFile(join(dirname(adapterJson), "src/bridge/package.json"), "utf8"));
    return { adapter, adapterJson, cli: { name, version: bridge.dependencies[name], source: "adapter-bootstrap" }, bootstrap: { dir, binary } };
  }
  const name = inProcess[agent];
  if (!name) throw new Error(`${agent} has no tier-A install recipe`);
  // These libraries export no ./package.json (step 3 plan, fact 11).
  const library = findPackageJSON(name, adapterJson);
  return { adapter, adapterJson, cli: { name, version: JSON.parse(await readFile(library, "utf8")).version, source: "in-process" } };
}

/** The bootstrap environment of an agent: its own home under DOJO_CONFORMANCE_HOME. */
export function agentHome(agent, environment = process.env) {
  return join(conformancePaths(environment).home, agent);
}

export function bootstrapBinary(agent, pinned, home = agentHome(agent)) {
  return pinned.bootstrap && join(home, ".ai-sdk-harness/.harness-bootstrap", pinned.bootstrap.dir, "node_modules/.bin", pinned.bootstrap.binary);
}

export async function readRecord() {
  return parseConformanceRecord(JSON.parse(await readFile(conformancePaths().record, "utf8")));
}

/** Installs one agent's pinned CLI and returns what ran; throws when the pin moved away from the record. */
export async function installAgent(agent, record) {
  const pinned = await pinnedCli(agent);
  const expected = latestConformance(record, agent, "A")?.cli.version ?? firstRunPins[agent];
  if (pinned.cli.version !== expected) {
    throw new Error(`${pinned.adapter.package} now pins ${pinned.cli.name} ${pinned.cli.version}; the record has ${expected}. Run tier A and append a record (pnpm --filter @dojofoo/authoring conformance:record).`);
  }
  const home = agentHome(agent);
  await mkdir(home, { recursive: true });
  const { prepareAuthoringHarness } = await import("../dist/eve/install.js");
  // Grok updates its own binary in GROK_HOME/bin unless told not to.
  const grok = agent === "grok" ? { GROK_HOME: join(home, ".grok"), GROK_DISABLE_AUTOUPDATER: "1" } : {};
  const environment = { ...await prepareHarnessEnvironment(caseBaseEnvironment(home)), HOME: home, ...grok };
  await prepareAuthoringHarness(agent, { environment, timeoutMs: 300_000 });
  let version = pinned.cli.version;
  if (pinned.bootstrap) {
    const { stdout } = await execute(bootstrapBinary(agent, pinned, home), ["--version"], { env: environment, timeout: 60_000 });
    version = stdout.match(/\d+\.\d+\.\d+/u)?.[0];
    if (version !== pinned.cli.version) throw new Error(`${pinned.cli.name} reports ${version ?? stdout.trim()}, not the pinned ${pinned.cli.version}`);
  } else {
    // In-process libraries load from the adapter's own directory, as the adapter loads them.
    await execute(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(pinned.cli.name)})`],
      { cwd: dirname(pinned.adapterJson), timeout: 60_000 });
  }
  return { adapter: pinned.adapter, cli: { ...pinned.cli, version } };
}

/** True when the agent's bootstrapped binary is missing (in-process agents need no install). */
export async function needsInstall(agent) {
  const binary = bootstrapBinary(agent, await pinnedCli(agent));
  return Boolean(binary) && !existsSync(binary);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(join(authoring, "dist/eve/install.js"))) {
    console.error('Build authoring first: pnpm --filter "@dojofoo/authoring..." build');
    process.exit(2);
  }
  const record = await readRecord();
  const { out } = conformancePaths();
  await mkdir(out, { recursive: true });
  const versions = {};
  for (const agent of tierAAgents()) {
    const started = Date.now();
    try {
      versions[agent] = await installAgent(agent, record);
      console.log(`${agent}: ${versions[agent].cli.name} ${versions[agent].cli.version} (${versions[agent].cli.source}, ${Date.now() - started} ms)`);
    } catch (error) {
      versions[agent] = { error: error instanceof Error ? error.message : String(error) };
      console.log(`${agent}: install failed: ${versions[agent].error}`);
    }
  }
  await writeFile(join(out, "versions.json"), `${JSON.stringify(versions, null, 2)}\n`);
}
