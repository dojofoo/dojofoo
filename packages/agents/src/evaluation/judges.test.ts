import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { criterionIds, judgePanel, judgePrompt, judgeSchema } from "./judges";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });
const verdict = {
  criteria: criterionIds.map(id => ({ id, pass: true, evidence: `Evidence for ${id}`, improvement: "None" })),
  overall: "pass", limitation: "Fixture",
};

it("judgePanel asks two isolated judges, parses fenced or bare JSON and fails on a malformed verdict", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dojo-judge-panel-")); directories.push(directory);
  const calls: Array<{ judge: string; prompt: string }> = [];
  const evidence = { "SENSEI.md": "Lesson guidance" };
  const panel = await judgePanel(evidence, AbortSignal.timeout(5000), async (judge, prompt) => {
    calls.push({ judge, prompt });
    return judge === "judge-1" ? JSON.stringify(verdict) : `\`\`\`json\n${JSON.stringify(verdict)}\n\`\`\``;
  }, { directory });
  expect(calls.map(call => call.judge)).toEqual(["judge-1", "judge-2"]);
  expect(calls[0]!.prompt).toBe(judgePrompt(evidence, judgeSchema));
  expect(calls[1]!.prompt).toBe(calls[0]!.prompt);
  expect(panel.map(result => result.judge)).toEqual(["judge-1", "judge-2"]);
  expect(panel[0]).toMatchObject({ root: directory, verdict: { overall: "pass" } });
  expect(await readFile(join(directory, "prompt.txt"), "utf8")).toBe(calls[0]!.prompt);
  expect(JSON.parse(await readFile(join(directory, "schema.json"), "utf8"))).toEqual(judgeSchema);
  expect(JSON.parse(await readFile(join(directory, "judge-2.json"), "utf8")).answer).toContain("```json");
  await expect(judgePanel(evidence, AbortSignal.timeout(5000), async judge => judge === "judge-1" ? JSON.stringify(verdict) : "It looks fine.", { directory }))
    .rejects.toThrow("judge-2 returned no valid verdict");
  await expect(judgePanel(evidence, AbortSignal.timeout(5000), async () => JSON.stringify({ ...verdict, overall: "maybe" }), { directory })).rejects.toThrow();
});
