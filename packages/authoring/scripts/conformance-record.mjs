// Appends one conformance entry per agent in a tier-A (or tier-B) run to packages/protocol/src/conformance.json
// (docs/designs/agent-runtime.steps/step-3.md, "conformance-record.mjs"). CI never runs this.
//   node scripts/conformance-record.mjs [--tier A|B] [--cli-range <range>] [--note <text>] [--allow-dirty]
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseConformanceRecord, personas } from "@dojofoo/protocol";
import { conformancePaths } from "./conformance-install.mjs";

const argument = name => { const index = process.argv.indexOf(name); return index === -1 ? undefined : process.argv[index + 1]; };
const tier = argument("--tier") ?? "A";
if (tier !== "A" && tier !== "B") throw new Error("--tier is A or B");
const { out, record: recordPath } = conformancePaths();
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const run = await readJson(join(out, "run.json"));
if (run.dirty && !process.argv.includes("--allow-dirty")) {
  console.error(`The run at ${run.commit} was made on a dirty tree; record a clean run, or pass --allow-dirty.`);
  process.exit(1);
}
const record = parseConformanceRecord(await readJson(recordPath));
const cases = await readJson(join(out, "cases.json"));
const versions = await readJson(join(out, "versions.json"));
const due = cases.cases.filter(entry => entry.since <= cases.implementedStep && entry.tier === "A" && entry.agents === "tier-a");
const entries = [];
for (const agent of cases.agents) {
  const report = join(out, `report-${agent}.json`);
  if (!existsSync(report)) continue;
  const outcomes = {};
  for (const file of (await readJson(report)).testResults ?? []) {
    for (const result of file.assertionResults ?? []) {
      if (result.ancestorTitles?.[0] !== "tier A" || result.ancestorTitles[1] !== agent) continue;
      const id = /^(\S+) \[/u.exec(result.title)?.[1];
      if (id) outcomes[id] = result.status;
    }
  }
  const installed = versions[agent];
  if (!installed || installed.error) throw new Error(`${agent}: versions.json has no installed CLI: ${installed?.error ?? "missing"}`);
  const observations = existsSync(join(out, "observations", `${agent}.json`)) ? await readJson(join(out, "observations", `${agent}.json`)) : {};
  entries.push({
    agent, tier, recordedAt: new Date().toISOString(), commit: run.commit, platform: run.platform, step: cases.implementedStep,
    adapter: installed.adapter, cli: installed.cli, cliRange: argument("--cli-range") ?? `=${installed.cli.version}`,
    personas: Object.fromEntries(personas.map(persona => {
      if (cases.implementedStep < cases.personaRecordedFrom[persona]) return [persona, "untested"];
      const own = due.filter(entry => entry.persona === persona);
      return [persona, own.length && own.every(entry => outcomes[entry.id] === "passed") ? "pass" : "fail"];
    })),
    cases: Object.fromEntries(due.map(entry => [entry.id, outcomes[entry.id] === "passed" ? "passed" : "failed"])),
    latency: observations.latency ?? null,
    absolutePathReads: observations.absolutePathReads ?? null,
    userConfig: observations.userConfig ?? {},
    ...(argument("--note") ? { note: argument("--note") } : {}),
  });
}
if (!entries.length) throw new Error(`No agent report in ${out}`);
const next = parseConformanceRecord({ ...record, entries: [...record.entries, ...entries] });
await writeFile(recordPath, `${JSON.stringify(next, null, 2)}\n`);
for (const entry of entries) console.log(`${entry.agent}: ${Object.entries(entry.personas).map(([persona, result]) => `${persona} ${result}`).join(", ")}`);
