import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { EvaluationReceipt, EvaluationReport } from "@dojofoo/authoring/evaluation/run";

const statuses = ["passed", "material-failed", "teaching-failed", "infrastructure-failed", "stale"];
function completedReport(value: unknown): EvaluationReport {
  const report = value as EvaluationReport | null;
  if (report?.version !== 1 || !report.completedAt || !statuses.includes(report.status)) throw new Error("The saved evaluation has no completed report");
  return report;
}

/** Host-owned allowance: at most three evaluations of the same lesson set, in `.dojo/evaluation-allowances/<hash of the lesson set>/`.
 * Claims are atomic and survive restarts. A replay never spends inference twice.
 * This is cost control for our tool, not an OS sandbox against a hostile author.
 */
export async function withAllowance(root: string, lessonIds: string[], callId: string,
  run: (signal: AbortSignal) => Promise<EvaluationReport>, signal: AbortSignal): Promise<EvaluationReceipt> {
  // Loaded as the evaluation's other authoring modules are, so the refusal is the class the routes recognise
  const { EvaluationRefused } = createRequire(import.meta.url)("@dojofoo/authoring/evaluation/failure") as typeof import("@dojofoo/authoring/evaluation/failure");
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  const directory = join(root, ".dojo", "evaluation-allowances", hash(JSON.stringify([...lessonIds].sort())));
  await mkdir(directory, { recursive: true });
  const receipt = join(directory, `${hash(callId)}.json`);
  // Claim the call before reserving an attempt: duplicate deliveries of the
  // same Eve tool call must never consume more than one attempt.
  // mkdir is atomic; readers never see a partially written claim/receipt.
  const claim = `${receipt}.claim`;
  const replay = async (): Promise<EvaluationReceipt> => {
    let saved;
    try { saved = JSON.parse(await readFile(receipt, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (!saved?.report) throw new Error("This evaluation was already started but has no final report. Inspect the retained attempt; it will not be rerun automatically.");
    return { attempt: saved.attempt, remaining: saved.remaining, report: completedReport(saved.report) };
  };
  // Honour receipts created before the atomic claim directory was introduced.
  try { await access(receipt); return await replay(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  try { await mkdir(claim); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return replay();
  }
  let attempt = 0;
  for (let index = 1; index <= 3; index++) {
    try { await mkdir(join(directory, String(index))); attempt = index; break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  if (!attempt) {
    await rm(claim, { recursive: true });
    throw new EvaluationRefused("allowance_exhausted", "Evaluation allowance exhausted: three attempts used. Report the remaining issue to the author; do not retry.");
  }
  const persist = async (value: unknown) => {
    await writeFile(`${receipt}.tmp`, JSON.stringify(value, null, 2));
    await rename(`${receipt}.tmp`, receipt);
  };
  await persist({ attempt, lessonIds });
  let report: EvaluationReport;
  try { report = completedReport(await run(signal)); }
  catch (error) {
    // Record the crash so a replay returns it instead of "already started".
    const now = new Date().toISOString();
    report = {
      version: 1, directory: "", materialHash: "", lessonIds, status: "infrastructure-failed", stage: "material",
      startedAt: now, completedAt: now, error: error instanceof Error ? error.message : String(error),
    };
    await persist({ attempt, remaining: 3 - attempt, report });
    if (signal.aborted) throw error;
  }
  const result = { attempt, remaining: 3 - attempt, report };
  await persist(result);
  return result;
}
