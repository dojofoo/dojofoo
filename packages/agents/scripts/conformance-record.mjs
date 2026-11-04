// Appends one conformance entry per agent in a tier-A (or tier-B) run to packages/protocol/src/conformance.json
// (docs/designs/agent-runtime.steps/step-3.md, "conformance-record.mjs"). CI never runs this.
//   node scripts/conformance-record.mjs [--tier A|B] [--cli-range <range>] [--note <text>] [--allow-dirty]
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { latestConformance, parseConformanceRecord, personas } from "@dojofoo/protocol";
import { conformancePaths } from "./conformance-install.mjs";

/** Outcome per case id in one agent's Vitest report: the agent's own cases under "tier <tier>", and in tier A the scripted cases its
 *  process ran once (step-5 plan, decision 5) */
export function outcomesOf(report, agent, tier = "A") {
  const outcomes = {};
  for (const file of report.testResults ?? []) {
    for (const result of file.assertionResults ?? []) {
      const [group, owner] = result.ancestorTitles ?? [];
      if (group !== `tier ${tier}` || (owner !== agent && !(tier === "A" && owner === "scripted"))) continue;
      const id = /^(\S+) \[/u.exec(result.title)?.[1];
      if (id) outcomes[id] = result.status;
    }
  }
  return outcomes;
}

/** A case is due for an agent when it runs on every agent of its tier, on a list naming the agent, or (tier A) on the scripted fixture
 *  (decision 5) */
export function dueFor(cases, agent, tier = "A") {
  return cases.cases.filter(entry => entry.since <= cases.implementedStep && entry.tier === tier
    && (entry.agents === (tier === "A" ? "tier-a" : "tier-b") || (tier === "A" && entry.agents === "scripted")
      || (Array.isArray(entry.agents) && entry.agents.includes(agent))));
}

/** Each persona's result. Tier A: pass when every due case of the persona passed. Tier B (step-8 plan, commit 11 and decisions 17 and 44):
 *  untested without a tier-A entry (Cursor); fail when a due tier-B case did not pass or the tier-A entry fails the persona; pass when
 *  every due tier-B case passed and the tier-A entry passes it; otherwise untested, as the tier-A entry left it. */
export function personaResults(cases, due, outcomes, tier = "A", tierA = undefined) {
  return Object.fromEntries(personas.map(persona => {
    if (cases.implementedStep < cases.personaRecordedFrom[persona]) return [persona, "untested"];
    const own = due.filter(entry => entry.persona === persona);
    const passed = own.length > 0 && own.every(entry => outcomes[entry.id] === "passed");
    if (tier === "A") return [persona, passed ? "pass" : "fail"];
    if (!tierA) return [persona, "untested"];
    if (!passed || tierA.personas[persona] === "fail") return [persona, "fail"];
    return [persona, tierA.personas[persona] === "pass" ? "pass" : "untested"];
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
  const kept = new Set(["latency", "absolutePathReads", "userConfig"]);
  const entries = [];
  for (const agent of cases.agents) {
    const report = join(out, `report-${agent}.json`);
    if (!existsSync(report)) continue;
    const outcomes = outcomesOf(await readJson(report), agent, tier);
    const installed = versions[agent];
    if (!installed || installed.error) throw new Error(`${agent}: versions.json has no installed CLI: ${installed?.error ?? "missing"}`);
    const observations = existsSync(join(out, "observations", `${agent}.json`)) ? await readJson(join(out, "observations", `${agent}.json`)) : {};
    const due = dueFor(cases, agent, tier);
    const other = Object.fromEntries(Object.entries(observations).filter(([key]) => !kept.has(key)));
    entries.push({
      agent, tier, recordedAt: new Date().toISOString(), commit: run.commit, platform: run.platform, step: cases.implementedStep,
      adapter: installed.adapter, cli: installed.cli, cliRange: argument("--cli-range") ?? `=${installed.cli.version}`,
      personas: personaResults(cases, due, outcomes, tier, tier === "B" ? latestConformance(record, agent, "A") : undefined),
      cases: Object.fromEntries(due.map(entry => [entry.id, outcomes[entry.id] === "passed" ? "passed" : "failed"])),
      latency: observations.latency ?? null,
      absolutePathReads: observations.absolutePathReads ?? null,
      userConfig: observations.userConfig ?? {},
      ...(Object.keys(other).length ? { observations: other } : {}),
      ...(argument("--note") ? { note: argument("--note") } : {}),
    });
  }
  if (!entries.length) throw new Error(`No agent report in ${out}`);
  const next = parseConformanceRecord({ ...record, entries: [...record.entries, ...entries] });
  await writeFile(recordPath, `${JSON.stringify(next, null, 2)}\n`);
  for (const entry of entries) console.log(`${entry.agent}: ${Object.entries(entry.personas).map(([persona, result]) => `${persona} ${result}`).join(", ")}`);
}
