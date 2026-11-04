import { describe, expect, it } from "vitest";
// @ts-expect-error The conformance scripts are plain JavaScript without declarations.
import { tierAAgents, tierBAgents } from "../../scripts/conformance-install.mjs";
// @ts-expect-error The conformance scripts are plain JavaScript without declarations.
import { dueFor, outcomesOf, personaResults } from "../../scripts/conformance-record.mjs";

// The parts of the tier-B runner and record that need no model (step-8 plan, commit 11)
describe("tierBAgents", () => {
  it("lists every registry row with an adapter, Cursor included, in registry order", () => {
    expect(tierBAgents({})).toEqual(["claude", "codex", "cursor", "grok", "opencode", "fx", "pi"]);
  });

  it("narrows to DOJO_CONFORMANCE_AGENTS in registry order, and refuses a row without an adapter", () => {
    expect(tierBAgents({ DOJO_CONFORMANCE_AGENTS: " opencode, cursor ,," })).toEqual(["cursor", "opencode"]);
    expect(() => tierBAgents({ DOJO_CONFORMANCE_AGENTS: "cursor,agy,nope" })).toThrow("Not a tier-B agent: agy, nope");
    // Tier A keeps refusing Cursor
    expect(() => tierAAgents({ DOJO_CONFORMANCE_AGENTS: "cursor" })).toThrow("Not a tier-A agent: cursor");
  });
});

const cases = { implementedStep: 8, personaRecordedFrom: { kyoshi: 3, sensei: 5 }, agents: ["cursor", "opencode"], cases: [
  { id: "kyoshi.harness.resume-after-stop", persona: "kyoshi", since: 3, tier: "A", agents: "tier-a" },
  { id: "sensei.guard.scripted", persona: "sensei", since: 5, tier: "A", agents: "scripted" },
  { id: "sensei.tier-b.latency", persona: "sensei", since: 8, tier: "B", agents: "tier-b" },
  { id: "kyoshi.tier-b.cold-start", persona: "kyoshi", since: 8, tier: "B", agents: "tier-b" },
  { id: "sensei.tier-b.cursor-asks-before-write", persona: "sensei", since: 8, tier: "B", agents: ["cursor"] },
  { id: "sensei.tier-b.later", persona: "sensei", since: 9, tier: "B", agents: "tier-b" },
] };
const report = (rows: Array<[string[], string, string]>) => ({ testResults: [{ assertionResults: rows.map(([ancestorTitles, id, status]) =>
  ({ ancestorTitles, title: `${id} [${id.split(".")[0]}, step 8]`, status })) }] });
const ids = (entries: Array<{ id: string }>) => entries.map(entry => entry.id);
const passing = { personas: { kyoshi: "pass", sensei: "pass" } };

describe("conformance-record --tier B", () => {
  it("is due for tier-B cases on every tier-B agent or on a list naming the agent, up to implementedStep", () => {
    expect(ids(dueFor(cases, "cursor", "B"))).toEqual(["sensei.tier-b.latency", "kyoshi.tier-b.cold-start", "sensei.tier-b.cursor-asks-before-write"]);
    expect(ids(dueFor(cases, "opencode", "B"))).toEqual(["sensei.tier-b.latency", "kyoshi.tier-b.cold-start"]);
    // Tier A's rule is unchanged
    expect(ids(dueFor(cases, "opencode"))).toEqual(["kyoshi.harness.resume-after-stop", "sensei.guard.scripted"]);
  });

  it("reads results under the title tier B and the agent only", () => {
    const outcomes = outcomesOf(report([
      [["tier B", "opencode"], "sensei.tier-b.latency", "passed"],
      [["tier B", "codex"], "kyoshi.tier-b.cold-start", "passed"],
      [["tier A", "opencode"], "kyoshi.harness.resume-after-stop", "passed"],
      [["tier B", "scripted"], "sensei.guard.scripted", "passed"],
    ]), "opencode", "B");
    expect(outcomes).toEqual({ "sensei.tier-b.latency": "passed" });
  });

  it("passes a persona only when every due tier-B case passed and the latest tier-A entry passes it", () => {
    const due = dueFor(cases, "opencode", "B");
    const all = { "sensei.tier-b.latency": "passed", "kyoshi.tier-b.cold-start": "passed" };
    expect(personaResults(cases, due, all, "B", passing)).toEqual({ kyoshi: "pass", sensei: "pass" });
    // A failed or missing tier-B case fails its persona
    expect(personaResults(cases, due, { ...all, "sensei.tier-b.latency": "failed" }, "B", passing)).toEqual({ kyoshi: "pass", sensei: "fail" });
    expect(personaResults(cases, due, { "sensei.tier-b.latency": "passed" }, "B", passing)).toEqual({ kyoshi: "fail", sensei: "pass" });
    // So does a tier-A entry that fails it; one that left it untested leaves it untested
    expect(personaResults(cases, due, all, "B", { personas: { kyoshi: "fail", sensei: "untested" } })).toEqual({ kyoshi: "fail", sensei: "untested" });
  });

  it("leaves both personas untested for an agent without a tier-A entry (Cursor, decision 17)", () => {
    const due = dueFor(cases, "cursor", "B");
    expect(personaResults(cases, due, { "sensei.tier-b.latency": "passed", "kyoshi.tier-b.cold-start": "passed",
      "sensei.tier-b.cursor-asks-before-write": "passed" }, "B", undefined)).toEqual({ kyoshi: "untested", sensei: "untested" });
    expect(personaResults(cases, due, { "sensei.tier-b.latency": "failed" }, "B", undefined)).toEqual({ kyoshi: "untested", sensei: "untested" });
  });

  it("keeps tier A's persona rule", () => {
    const due = dueFor(cases, "opencode");
    expect(personaResults(cases, due, { "kyoshi.harness.resume-after-stop": "passed", "sensei.guard.scripted": "failed" })).toEqual({ kyoshi: "pass", sensei: "fail" });
  });
});
