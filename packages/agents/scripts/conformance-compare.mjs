// Compares a tier-A run with the committed conformance record
// (docs/designs/agent-runtime.steps/step-3.md, "conformance-compare.mjs"). Exits 1 with one line per reason.
//   node scripts/conformance-compare.mjs [--base <git ref>] [--require-all]
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { latestConformance, parseConformanceRecord, personas } from "@dojofoo/protocol";
import { conformancePaths, tierAAgents } from "./conformance-install.mjs";

const authoring = fileURLToPath(new URL("..", import.meta.url));
const argument = name => { const index = process.argv.indexOf(name); return index === -1 ? undefined : process.argv[index + 1]; };
const base = argument("--base") ?? "origin/main";
const requireAll = process.argv.includes("--require-all") || process.env.CI === "true";
const { out, record: recordPath } = conformancePaths();
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const failures = [];

let record;
const committed = await readJson(recordPath);
try { record = parseConformanceRecord(committed); }
catch (error) { failures.push(`The record does not parse: ${error.message}`); }

const repository = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: authoring, encoding: "utf8" }).trim();
let previous;
try {
  previous = JSON.parse(execFileSync("git", ["show", `${base}:${relative(repository, recordPath)}`],
    { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
} catch { console.log(`notice: ${base} has no conformance record; the append-only check is skipped`); }
if (previous) {
  const before = Array.isArray(previous.entries) ? previous.entries : [];
  const now = Array.isArray(committed.entries) ? committed.entries : [];
  if (previous.schema !== committed.schema || before.length > now.length || before.some((entry, index) => !isDeepStrictEqual(entry, now[index]))) {
    failures.push(`The record is no longer append-only: the record at ${base} is not a prefix of the current one`);
  }
}

const cases = await readJson(join(out, "cases.json"));
const versions = existsSync(join(out, "versions.json")) ? await readJson(join(out, "versions.json")) : {};
// Outcome per agent and case id, from that agent's own report (one Vitest process per agent).
const agents = tierAAgents();
const outcomes = {};
for (const agent of agents) {
  const report = join(out, `report-${agent}.json`);
  if (!existsSync(report)) continue;
  outcomes[agent] = {};
  for (const file of (await readJson(report)).testResults ?? []) {
    for (const result of file.assertionResults ?? []) {
      // An agent's own cases, and the scripted cases its process ran once (step-5 plan, decision 5)
      if (result.ancestorTitles?.[0] !== "tier A" || (result.ancestorTitles[1] !== agent && result.ancestorTitles[1] !== "scripted")) continue;
      const id = /^(\S+) \[/u.exec(result.title)?.[1];
      if (id) outcomes[agent][id] = result.status;
    }
  }
}
/** A case is due for an agent when it runs on every tier-A agent, on a list naming the agent, or on the scripted fixture (decision 5) */
const dueFor = agent => cases.cases.filter(entry => entry.since <= cases.implementedStep && entry.tier === "A"
  && (entry.agents === "tier-a" || entry.agents === "scripted" || (Array.isArray(entry.agents) && entry.agents.includes(agent))));
const personaNow = agent => Object.fromEntries(personas.map(persona => {
  if (cases.implementedStep < cases.personaRecordedFrom[persona]) return [persona, "untested"];
  const own = dueFor(agent).filter(entry => entry.persona === persona);
  return [persona, own.length && own.every(entry => outcomes[agent]?.[entry.id] === "passed") ? "pass" : "fail"];
}));

const rows = [];
for (const agent of agents) {
  const latest = record && latestConformance(record, agent, "A");
  const passing = latest ? personas.filter(persona => latest.personas[persona] === "pass") : [];
  const ran = outcomes[agent];
  const due = dueFor(agent);
  const failing = due.filter(entry => ran?.[entry.id] !== "passed").map(entry => entry.id);
  if (!ran) {
    if (requireAll && passing.length) failures.push(`${agent}: no report, but its recorded tier-A entry passes ${passing.join(", ")}`);
  } else if (latest) {
    for (const [id, outcome] of Object.entries(latest.cases)) {
      if (outcome === "passed" && ran[id] !== "passed") failures.push(`${agent}: regression: ${id} was recorded passed and is now ${ran[id] ?? "missing"}`);
    }
    for (const persona of passing) {
      for (const entry of due.filter(item => item.persona === persona && ran[item.id] === "failed")) {
        failures.push(`${agent}: ${entry.id} fails, but ${persona} is recorded pass`);
      }
    }
  }
  if (passing.length) {
    const installed = versions[agent];
    if (!installed || installed.error) failures.push(`${agent}: the pinned CLI did not install: ${installed?.error ?? "no versions.json entry"}`);
    else if (installed.cli.version !== latest.cli.version) failures.push(`${agent}: the pinned CLI is ${installed.cli.version}; the recorded entry has ${latest.cli.version}`);
  } else if (ran && failing.length) {
    console.log(`${agent}: not offered yet; failing: ${failing.join(", ")}`);
  }
  const now = ran ? personaNow(agent) : undefined;
  rows.push([agent, ...personas.map(persona => now?.[persona] ?? "no report"), ...personas.map(persona => latest?.personas[persona] ?? "none")]);
}
console.log(["agent", ...personas.map(persona => `${persona} now`), ...personas.map(persona => `${persona} recorded`)].join("\t"));
for (const row of rows) console.log(row.join("\t"));
for (const failure of failures) console.error(failure);
process.exit(failures.length ? 1 : 0);
