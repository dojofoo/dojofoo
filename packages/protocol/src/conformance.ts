import { agentRows, isAgentId, type AgentId, type AgentRow } from "./agents.js";
import shipped from "./conformance.json" with { type: "json" };
import { personas, type Persona } from "./personas.js";

/** Tier A runs on every pull request against the loopback model; tier B against real models with the user's logins. */
export type ConformanceTier = "A" | "B";
export type PersonaConformance = "pass" | "fail" | "untested";
export interface ConformanceEntry {
  agent: AgentId;
  tier: ConformanceTier;
  /** Full ISO 8601 timestamp with time and zone, for people. "Latest" is decided by array order. */
  recordedAt: string;
  /** The 40-character commit the run tested (in CI the PR head, not GitHub's merge commit), and its platform ("linux-x64", "darwin-arm64"). */
  commit: string;
  platform: string;
  /** The roadmap step whose cases ran (conformance.test.ts implementedStep). */
  step: number;
  adapter: { package: string; version: string };
  cli: { name: string; version: string; source: "adapter-bootstrap" | "in-process" | "user-install" };
  /** CLI versions this entry vouches for (semver range). Tier A writes "=<cli.version>"; tier B passes it explicitly. */
  cliRange: string;
  personas: Record<Persona, PersonaConformance>;
  /** Outcome of every case due at `step`, by case id. */
  cases: Readonly<Record<string, "passed" | "failed">>;
  /** Tier B latency (design, "Conformance tiers"): slow when the median is above 15 s. null until measured. */
  latency: { medianFirstOutputMs: number; slow: boolean } | null;
  /** Open risk 13: absolute paths a read-only persona could read. null until step 4's case runs. */
  absolutePathReads: ReadonlyArray<{ path: string; read: boolean }> | null;
  /** Which seeded user config reached the model, per persona (D34). */
  userConfig: Partial<Record<Persona, { mcp: boolean; skill: boolean; rules: boolean }>>;
  /** Every other observation of the run (`observations/<agent>.json`), by key: facts a case records rather than requires */
  observations?: Readonly<Record<string, unknown>>;
  note?: string;
}
export interface ConformanceRecord { schema: 1; entries: readonly ConformanceEntry[] }

/** A persona's result is "untested" in entries of earlier steps (design, Step 3: Sensei stays untested until step 5). */
export const personaRecordedFrom: Readonly<Record<Persona, number>> = { kyoshi: 3, sensei: 5 };

const cliSources = ["adapter-bootstrap", "in-process", "user-install"];
const personaResults = ["pass", "fail", "untested"];
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isFlag = (value: unknown): value is boolean => typeof value === "boolean";
// A day alone ("2026-11-04") is not enough: several entries can share one.
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/u;

function entryProblem(entry: unknown): string | undefined {
  if (!isObject(entry)) return "entry";
  if (!isAgentId(entry.agent)) return "agent";
  if (entry.tier !== "A" && entry.tier !== "B") return "tier";
  if (typeof entry.recordedAt !== "string" || !timestamp.test(entry.recordedAt) || Number.isNaN(Date.parse(entry.recordedAt))) return "recordedAt";
  if (typeof entry.commit !== "string" || !/^[0-9a-f]{40}$/u.test(entry.commit)) return "commit";
  if (!isText(entry.platform)) return "platform";
  if (typeof entry.step !== "number" || !Number.isInteger(entry.step) || entry.step < 1) return "step";
  if (!isObject(entry.adapter) || !isText(entry.adapter.package) || !isText(entry.adapter.version)) return "adapter";
  const { cli } = entry;
  if (!isObject(cli) || !isText(cli.name) || !isText(cli.version) || !cliSources.includes(cli.source as string)) return "cli";
  if (!isText(entry.cliRange) || (entry.tier === "A" && entry.cliRange !== `=${cli.version}`)) return "cliRange";
  const results = entry.personas;
  if (!isObject(results) || Object.keys(results).length !== personas.length
    || personas.some(persona => !personaResults.includes(results[persona] as string)
      || (entry.step as number) < personaRecordedFrom[persona] && results[persona] !== "untested")) return "personas";
  if (!isObject(entry.cases) || Object.values(entry.cases).some(outcome => outcome !== "passed" && outcome !== "failed")) return "cases";
  const { latency } = entry;
  if (latency !== null && (!isObject(latency) || typeof latency.medianFirstOutputMs !== "number"
    || !(latency.medianFirstOutputMs >= 0) || !isFlag(latency.slow))) return "latency";
  if (entry.absolutePathReads !== null && (!Array.isArray(entry.absolutePathReads)
    || entry.absolutePathReads.some(read => !isObject(read) || !isText(read.path) || !isFlag(read.read)))) return "absolutePathReads";
  const { userConfig } = entry;
  if (!isObject(userConfig) || Object.entries(userConfig).some(([persona, seen]) => !(personas as readonly string[]).includes(persona)
    || !isObject(seen) || !isFlag(seen.mcp) || !isFlag(seen.skill) || !isFlag(seen.rules))) return "userConfig";
  if (entry.observations !== undefined && !isObject(entry.observations)) return "observations";
  if (entry.note !== undefined && typeof entry.note !== "string") return "note";
  return undefined;
}

/** Throws "Invalid conformance entry <index>: <field>" for any field above; also when a persona is not "untested" in an entry
 *  of a step before personaRecordedFrom, when recordedAt has no time ("2026-11-04"), and when a tier-A cliRange is not "=<cli.version>". */
export function parseConformanceRecord(value: unknown): ConformanceRecord {
  if (!isObject(value) || value.schema !== 1) throw new Error("Invalid conformance record: schema");
  if (!Array.isArray(value.entries)) throw new Error("Invalid conformance record: entries");
  value.entries.forEach((entry, index) => {
    const problem = entryProblem(entry);
    if (problem) throw new Error(`Invalid conformance entry ${index}: ${problem}`);
  });
  return value as unknown as ConformanceRecord;
}

/** The last entry for the agent (and tier, when given) in array order. */
export function latestConformance(record: ConformanceRecord, agent: AgentId, tier?: ConformanceTier): ConformanceEntry | undefined {
  for (let index = record.entries.length - 1; index >= 0; index--) {
    const entry = record.entries[index]!;
    if (entry.agent === agent && (tier === undefined || entry.tier === tier)) return entry;
  }
  return undefined;
}

let shippedRecord: ConformanceRecord | undefined;

/** The record this package ships (`src/conformance.json`), parsed once. */
export function shippedConformance(): ConformanceRecord {
  return shippedRecord ??= parseConformanceRecord(shipped);
}

/** Rows with an adapter whose latest entry passes both personas (design, "Offered agents": from step 5). */
export function offeredFrom(record: ConformanceRecord): readonly AgentRow[] {
  return agentRows.filter(row => {
    if (!row.adapterId) return false;
    const latest = latestConformance(record, row.id);
    return latest?.personas.kyoshi === "pass" && latest.personas.sensei === "pass";
  });
}
