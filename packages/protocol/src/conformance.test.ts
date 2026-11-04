/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestConformance, parseConformanceRecord, type ConformanceEntry } from ".";

const entry = (overrides: Partial<ConformanceEntry> = {}): ConformanceEntry => ({
  agent: "codex", tier: "A", recordedAt: "2026-11-04T12:00:00Z", commit: "c4f6245".padEnd(40, "0"), platform: "linux-x64", step: 3,
  adapter: { package: "@ai-sdk/harness-codex", version: "1.0.169" },
  cli: { name: "@openai/codex", version: "0.160.1", source: "adapter-bootstrap" }, cliRange: "=0.160.1",
  personas: { kyoshi: "pass", sensei: "untested" }, cases: { "kyoshi.harness.resume-after-stop": "passed" },
  latency: null, absolutePathReads: null, userConfig: { kyoshi: { mcp: false, skill: true, rules: true } },
  ...overrides,
});
const record = (...entries: ConformanceEntry[]) => ({ schema: 1, entries });

describe("conformance record", () => {
  it("the committed record parses", () => {
    expect(() => parseConformanceRecord(JSON.parse(readFileSync(new URL("./conformance.json", import.meta.url), "utf8")))).not.toThrow();
  });

  it("latest is the last entry in array order, whatever its timestamp", () => {
    const later = entry({ recordedAt: "2026-11-05T09:00:00+01:00", note: "first" });
    const appended = entry({ recordedAt: "2026-11-04T08:00:00Z", note: "second" });
    const parsed = parseConformanceRecord(record(later, entry({ agent: "grok", cli: { name: "@xai-official/grok", version: "1.0.49", source: "adapter-bootstrap" }, cliRange: "=1.0.49" }), appended));
    expect(latestConformance(parsed, "codex")?.note).toBe("second");
    expect(latestConformance(parsed, "claude")).toBeUndefined();
  });

  it("latest can be narrowed to a tier", () => {
    const parsed = parseConformanceRecord(record(entry({ note: "tier A" }), entry({ tier: "B", cliRange: ">=0.160.0 <0.161.0", note: "tier B" })));
    expect(latestConformance(parsed, "codex")?.note).toBe("tier B");
    expect(latestConformance(parsed, "codex", "A")?.note).toBe("tier A");
  });

  it("rejects a timestamp without a time", () => {
    expect(() => parseConformanceRecord(record(entry(), entry({ recordedAt: "2026-11-04" })))).toThrow("Invalid conformance entry 1: recordedAt");
    expect(() => parseConformanceRecord(record(entry({ recordedAt: "2026-11-04T12:00:00" })))).toThrow("Invalid conformance entry 0: recordedAt");
  });

  it("Sensei stays untested in entries recorded before step 5", () => {
    expect(() => parseConformanceRecord(record(entry({ personas: { kyoshi: "pass", sensei: "pass" } })))).toThrow("Invalid conformance entry 0: personas");
    expect(() => parseConformanceRecord(record(entry({ step: 4, personas: { kyoshi: "pass", sensei: "fail" } })))).toThrow("Invalid conformance entry 0: personas");
    expect(() => parseConformanceRecord(record(entry({ step: 5, personas: { kyoshi: "pass", sensei: "pass" } })))).not.toThrow();
  });

  it("a tier-A range names exactly the CLI version that ran", () => {
    expect(() => parseConformanceRecord(record(entry({ cliRange: ">=0.160.1" })))).toThrow("Invalid conformance entry 0: cliRange");
    expect(() => parseConformanceRecord(record(entry({ cliRange: "=0.160.0" })))).toThrow("Invalid conformance entry 0: cliRange");
    expect(() => parseConformanceRecord(record(entry({ tier: "B", cliRange: ">=0.160.1" })))).not.toThrow();
  });
});
