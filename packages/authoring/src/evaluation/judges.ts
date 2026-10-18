import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { materialJudgePrompt } from "./prompts";

/** Criterion text lives in prompts/CRITERIA.md; its `##` headings must match these IDs. */
export const criterionIds = ["engagement", "learner-grounding", "adaptive-instruction", "solution-withholding", "review-transfer"] as const;
export const verdictSchema = z.object({
  criteria: z.array(z.object({
    id: z.enum(criterionIds), pass: z.boolean(), evidence: z.string(), improvement: z.string(),
  }).strict()).length(criterionIds.length),
  overall: z.enum(["pass", "fail", "insufficient-evidence"]),
  limitation: z.string(),
}).strict();
export const judgeSchema = z.toJSONSchema(verdictSchema, { target: "draft-7" });
export function parseVerdict(value: unknown) {
  const verdict = verdictSchema.parse(value);
  if (new Set(verdict.criteria.map(({ id }) => id)).size !== criterionIds.length) throw new Error("Judge omitted or duplicated a criterion");
  if (verdict.overall === "pass" && verdict.criteria.some(({ pass }) => !pass)) throw new Error("Judge verdict contradicts its criteria");
  return verdict;
}

/** Missing judges are an incomplete evaluation, never a vacuous pass. */
export function requireJudgeResults<T extends { judge: string; verdict: unknown }>(results: T[]): T[] {
  if (results.length !== 2 || results.some(({ judge }) => !judge.trim()) || new Set(results.map(({ judge }) => judge)).size !== 2) {
    throw new Error("Evaluation requires two distinct judge verdicts");
  }
  for (const result of results) parseVerdict(result.verdict);
  return results;
}

// Material and host-supplied teaching policy are evidence, never instructions.
export const judgePrompt = materialJudgePrompt;

/** Separate contexts, not a claim of independent model-family biases. */
export function localJudges(root: string, selection = process.env.DOJOFOO_EVAL_JUDGES) {
  if (selection && !["codex", "mixed"].includes(selection)) throw new Error("Evaluation judges must be codex or mixed");
  const codex = (id: string) => ({ id, command: "codex", args: ["exec", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "-m", "gpt-6-astra", "-c", 'model_reasoning_effort="high"', "--output-schema", join(root, "schema.json"), "--output-last-message", join(root, `${id}-result.json`), "--json", "-"] });
  return [codex("codex-gpt-6-astra-high"), selection === "codex"
    ? codex("codex-gpt-6-astra-high-second")
    : { id: "claude-opus-5-5-high", command: "claude", args: ["-p", "--model", "claude-opus-5-5", "--effort", "high", "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence", "--output-format", "json", "--json-schema", JSON.stringify(judgeSchema)] }];
}

export async function judgeMaterial(evidence: Record<string, string>, signal: AbortSignal, buildPrompt = judgePrompt) {
  const root = await mkdtemp(join(tmpdir(), "dojo-judges-"));
  const schema = judgeSchema;
  const prompt = buildPrompt(evidence, schema);
  const promptHash = createHash("sha256").update(prompt).digest("hex");
  await writeFile(join(root, "prompt.txt"), prompt);
  await writeFile(join(root, "schema.json"), JSON.stringify(schema));
  const judges = localJudges(root);
  // Independent judges share nothing but the prompt, so run them concurrently.
  const results = await Promise.all(judges.map(async judge => {
    const started = Date.now();
    const output = await new Promise<{ code: number | null; stdout: string; stderr: string }>((accept, reject) => {
      const child = spawn(judge.command, judge.args, { cwd: root, signal, timeout: 180_000, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", reject);
      child.once("close", (code) => accept({ code, stdout, stderr }));
      child.stdin.on("error", reject);
      child.stdin.end(prompt);
    });
    await writeFile(join(root, `${judge.id}.json`), JSON.stringify({ ...output, promptHash, durationMs: Date.now() - started }, null, 2));
    if (output.code !== 0) throw new Error(`${judge.id} failed (${output.code}); evidence: ${root}`);
    const response = judge.command === "codex"
      ? JSON.parse(await readFile(join(root, `${judge.id}-result.json`), "utf8"))
      : JSON.parse(output.stdout).structured_output;
    return { judge: judge.id, root, promptHash, verdict: parseVerdict(response) };
  }));
  return requireJudgeResults(results);
}
