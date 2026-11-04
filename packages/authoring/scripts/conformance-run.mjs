// Runs tier A, one Vitest process per agent, from the allow-listed environment
// (docs/designs/agent-runtime.steps/step-3.md, "conformance-run.mjs"). The compare script judges the results.
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { caseBaseEnvironment, conformancePaths, tierAAgents } from "./conformance-install.mjs";

const authoring = fileURLToPath(new URL("..", import.meta.url));
const { home, out } = conformancePaths();
// Vitest's own entry on this Node, not `pnpm exec`: the caller's pnpm may be a version-manager shim that reads the
// developer's own config, which the allow-listed HOME no longer vouches for.
const vitest = join(dirname(createRequire(join(authoring, "package.json")).resolve("vitest/package.json")), "vitest.mjs");
const git = (...args) => execFileSync("git", args, { cwd: authoring, encoding: "utf8" }).trim();
await mkdir(out, { recursive: true });
await mkdir(caseBaseEnvironment().HOME, { recursive: true });
const runPath = join(out, "run.json");
const run = {
  commit: process.env.DOJO_CONFORMANCE_COMMIT ?? git("rev-parse", "HEAD"),
  dirty: git("status", "--porcelain") !== "",
  platform: `${process.platform}-${process.arch}`,
  startedAt: new Date().toISOString(),
};
await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`);
const vitestExitCodes = {};
const missing = [];
for (const agent of tierAAgents()) {
  const report = join(out, `report-${agent}.json`);
  const environment = { ...caseBaseEnvironment(), DOJO_HARNESS_LIFECYCLE: "1", DOJO_CONFORMANCE_AGENTS: agent,
    DOJO_CONFORMANCE_HOME: home, DOJO_CONFORMANCE_OUT: out, ...(process.env.CI === undefined ? {} : { CI: process.env.CI }) };
  await rm(report, { force: true });
  console.log(`tier A: ${agent}`);
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
