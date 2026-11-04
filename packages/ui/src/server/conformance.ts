import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseConformanceRecord, type ConformanceRecord } from "@dojofoo/protocol";

let cached: ConformanceRecord | undefined;

/** The conformance record dojofoo ships (@dojofoo/protocol/conformance.json), read once per process. */
export function committedConformance(): ConformanceRecord {
  cached ??= parseConformanceRecord(JSON.parse(readFileSync(createRequire(import.meta.url).resolve("@dojofoo/protocol/conformance.json"), "utf8")));
  return cached;
}
