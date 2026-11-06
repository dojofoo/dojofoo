// Runs tier A, one Vitest process per agent, from the allow-listed environment
// (docs/designs/agent-runtime.steps/step-3.md, "conformance-run.mjs"). The compare script judges the results.
//   node scripts/conformance-run.mjs [--tier A|B]
// Tier B (step-8 plan, commit 11) runs every agent with an adapter on the caller's own environment, logins and installs, into <out>/tier-b/.
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { caseBaseEnvironment, conformancePaths, tierAAgents, tierBAgents, tierBVersion } from "./conformance-install.mjs";

const argument = name => { const index = process.argv.indexOf(name); return index === -1 ? undefined : process.argv[index + 1]; };
const tier = argument("--tier") ?? "A";
if (tier !== "A" && tier !== "B") throw new Error("--tier is A or B");
const authoring = fileURLToPath(new URL("..", import.meta.url));
const { home } = conformancePaths();
const out = tier === "B" ? join(conformancePaths().out, "tier-b") : conformancePaths().out;
// Vitest's own entry on this Node, not `pnpm exec`: the caller's pnpm may be a version-manager shim that reads the
// developer's own config, which the allow-listed HOME no longer vouches for.
const vitest = join(dirname(createRequire(join(authoring, "package.json")).resolve("vitest/package.json")), "vitest.mjs");
const git = (...args) => execFileSync("git", args, { cwd: authoring, encoding: "utf8" }).trim();
await mkdir(out, { recursive: true });
if (tier === "A") await mkdir(caseBaseEnvironment().HOME, { recursive: true });
const runPath = join(out, "run.json");
const run = {
  commit: process.env.DOJO_CONFORMANCE_COMMIT ?? git("rev-parse", "HEAD"),
  dirty: git("status", "--porcelain") !== "",
  platform: `${process.platform}-${process.arch}`,
  startedAt: new Date().toISOString(),
};
await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`);
const agents = tier === "B" ? tierBAgents() : tierAAgents();
if (tier === "B") {
  // What each agent ran on, for the record (conformance:install writes tier A's)
  const versions = {};
  for (const agent of agents) {
    try { versions[agent] = await tierBVersion(agent); }
    catch (error) { versions[agent] = { error: error instanceof Error ? error.message : String(error) }; }
    console.log(`${agent}: ${versions[agent].error ?? `${versions[agent].cli.name} ${versions[agent].cli.version} (${versions[agent].cli.source})`}`);
  }
  await writeFile(join(out, "versions.json"), `${JSON.stringify(versions, null, 2)}\n`);
}
const vitestExitCodes = {};
const missing = [];
for (const agent of agents) {
  const report = join(out, `report-${agent}.json`);
  const environment = tier === "B"
    ? { ...process.env, DOJO_HARNESS_LIFECYCLE: "1", DOJO_CONFORMANCE_TIER: "B", DOJO_CONFORMANCE_AGENTS: agent, DOJO_CONFORMANCE_OUT: out }
    : { ...caseBaseEnvironment(), DOJO_HARNESS_LIFECYCLE: "1", DOJO_CONFORMANCE_AGENTS: agent,
      DOJO_CONFORMANCE_HOME: home, DOJO_CONFORMANCE_OUT: out, ...(process.env.CI === undefined ? {} : { CI: process.env.CI }) };
  await rm(report, { force: true });
  console.log(`tier ${tier}: ${agent}`);
  vitestExitCodes[agent] = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [vitest, "run", "src/eve/conformance.test.ts", "--reporter=default", "--reporter=json",
      `--outputFile.json=${report}`], { cwd: authoring, env: environment, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", code => resolve(code));
  });
  if (!existsSync(report)) missing.push(agent);
}
await writeFile(runPath, `${JSON.stringify({ ...JSON.parse(await readFile(runPath, "utf8")), finishedAt: new Date().toISOString(), vitestExitCodes }, null, 2)}\n`);
if (missing.length) {
  console.error(`No Vitest report for ${missing.join(", ")}`);
  process.exit(1);
}
