import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { recordCassette } from "../src/tracking";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("records Pi dialogue while ignoring absent message payloads", () => {
  vi.stubEnv("DOJOFOO_HARNESS", "");
  vi.stubEnv("OPENCODE", "");
  vi.stubEnv("CLAUDECODE", "");
  vi.stubEnv("PI_CODING_AGENT", "1");
  const root = mkdtempSync(join(tmpdir(), "dojo-tracking-"));
  roots.push(root);
  const source = join(root, "session.jsonl");
  writeFileSync(source, [
    { type: "message", message: null },
    { type: "message" },
    { type: "message", message: { role: "user", content: "What does this mean?" } },
    { type: "message", message: { role: "assistant", content: [{ type: "text", text: "Let's use an example." }] } },
  ].map(event => JSON.stringify(event)).join("\n"));

  const cassette = recordCassette(root, ["--source", source]);
  expect(cassette.agent).toBe("pi");
  expect(cassette.entries).toBe(2);
  expect(JSON.parse(readFileSync(cassette.outputPath, "utf8"))).toEqual([
    { role: "user", content: "What does this mean?" },
    { role: "assistant", content: "Let's use an example." },
  ]);
});
