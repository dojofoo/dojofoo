import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { parse, YAMLParseError } from "yaml";
import { MaterialFailure } from "./failure.ts";
import { preflightLessons } from "./preflight.ts";
import { readLessonSensei } from "./sensei.ts";
import type { EvaluationReport } from "./run";

const execute = promisify(execFile);
export interface EvaluationConfiguration {
  workerPath: string;
  teachingHarness: string;
  teachingModel: string;
  fixtureHarness: string;
  fixtureModel: string;
}
type EvaluationReceipt = { attempt: number; remaining: number; report: EvaluationReport };

export function evaluationConfiguration(env: NodeJS.ProcessEnv = process.env): EvaluationConfiguration | undefined {
  const values = [env.DOJOFOO_EVAL_TEACHING_HARNESS, env.DOJOFOO_EVAL_TEACHING_MODEL, env.DOJOFOO_EVAL_FIXTURE_HARNESS, env.DOJOFOO_EVAL_FIXTURE_MODEL];
  if (values.every(value => !value)) return undefined;
  if (values.some(value => !value?.trim())) throw new Error("Select teaching and learner harnesses/models together");
  if (!env.DOJO_CLI) throw new Error("The bundled Dojofoo evaluator is unavailable. Start the interface with dojofoo ui --authoring.");
  return { workerPath: join(dirname(env.DOJO_CLI), "teaching-eval.js"), teachingHarness: values[0]!, teachingModel: values[1]!, fixtureHarness: values[2]!, fixtureModel: values[3]! };
}

function reportFromOutput(output: string): EvaluationReport {
  const report = JSON.parse(output.trim().split("\n").at(-1) ?? "null") as EvaluationReport;
  if (report?.version !== 1 || !report.completedAt || !["passed", "material-failed", "teaching-failed", "infrastructure-failed", "stale"].includes(report.status)) {
    throw new Error("Evaluation worker returned no completed report");
  }
  return report;
}

export async function executeEvaluationWorker(root: string, lessonIds: string[], config: EvaluationConfiguration, signal: AbortSignal, profile: "struggling" | "confident" = "struggling") {
  const options = {
    cwd: root, signal, timeout: 2_160_000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, DOJOFOO_HARNESS: config.teachingHarness, DOJOFOO_HANDOFF_MODEL: config.teachingModel,
      DOJOFOO_EVAL_FIXTURE_HARNESS: config.fixtureHarness, DOJOFOO_EVAL_FIXTURE_MODEL: config.fixtureModel },
  };
  try {
    const mode = profile === "confident" ? "--evaluate-heldout" : "--evaluate";
    const { stdout } = await execute(process.execPath, [config.workerPath, mode, root, ...lessonIds], options);
    return reportFromOutput(stdout);
  } catch (error) {
    // A failed rubric intentionally exits 1 while retaining its structured report.
    if (error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string" && error.stdout.trim()) {
      return reportFromOutput(error.stdout);
    }
    throw error;
  }
}

/** Host-owned allowance: at most three evaluations of the same lesson set.
 * Claims are atomic and survive restarts. A replay never spends inference twice.
 * This is cost control for our tool, not an OS sandbox against a hostile author.
 */
export async function evaluateFromAuthoring({ root, lessonIds, callId, config, signal, run = executeEvaluationWorker }: {
  root: string; lessonIds: string[]; callId: string; config?: EvaluationConfiguration; signal: AbortSignal;
  run?: typeof executeEvaluationWorker;
}): Promise<EvaluationReceipt> {
  if (!config) throw new Error("Teaching evaluations are not configured. Select evaluation harnesses/models before spending usage.");
  signal.throwIfAborted();
  if (!callId || !lessonIds.length || lessonIds.length > 2 || new Set(lessonIds).size !== lessonIds.length) throw new Error("Evaluate one lesson or two distinct lessons for continuity");
  const source = await readFile(join(root, "dojo.yaml"), "utf8");
  let manifest;
  try { manifest = parse(source); }
  catch (error) {
    if (error instanceof YAMLParseError) throw new MaterialFailure(`Invalid authored dojo.yaml: ${error.message}`);
    throw error;
  }
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.katas)) {
    throw new MaterialFailure("Invalid authored dojo.yaml: expected a katas list");
  }
  if (manifest.katas.some((entry: unknown) => !entry || typeof entry !== "object" || !("name" in entry) || typeof entry.name !== "string" || !entry.name.trim())) {
    throw new MaterialFailure("Invalid authored dojo.yaml: each kata needs a name");
  }
  const names = new Set<string>();
  for (const { name } of manifest.katas as Array<{ name: string }>) {
    if (names.has(name)) throw new MaterialFailure(`Duplicate lesson ID: ${name}. Keep one entry in dojo.yaml.`);
    names.add(name);
  }
  if (!lessonIds.every(id => manifest.katas?.some((entry: { name: string }) => entry.name === id))) throw new Error("Evaluation lesson is not in this course");
  for (const id of lessonIds) {
    const template = manifest.katas.find((entry: { name: string; template?: unknown }) => entry.name === id)?.template;
    if (typeof template !== "string" || !template.trim()) throw new MaterialFailure(`Lesson ${id} needs a template`);
    await readLessonSensei(root, template);
  }
  // Free checks first: a structural gap never spends a paid attempt.
  const failing = (await preflightLessons(root, lessonIds)).filter(({ pass }) => !pass);
  if (failing.length) {
    throw new MaterialFailure(`Lesson preflight failed; no attempt was used.\n${failing.map(({ lessonId, findings }) => `${lessonId}:\n${findings.map(finding => `- ${finding}`).join("\n")}`).join("\n")}`);
  }
  await access(config.workerPath);
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  const directory = join(root, ".dojo", "evaluation-allowances", hash(JSON.stringify([...lessonIds].sort())));
  await mkdir(directory, { recursive: true });
  const receipt = join(directory, `${hash(callId)}.json`);
  // Claim the call before reserving an attempt: duplicate deliveries of the
  // same Eve tool call must never consume more than one attempt.
  // mkdir is atomic; readers never see a partially written claim/receipt.
  const claim = `${receipt}.claim`;
  const replay = async () => {
    let saved;
    try { saved = JSON.parse(await readFile(receipt, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (!saved?.report) throw new Error("This evaluation was already started but has no final report. Inspect the retained attempt; it will not be rerun automatically.");
    return { attempt: saved.attempt, remaining: saved.remaining, report: reportFromOutput(JSON.stringify(saved.report)) };
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
    throw new Error("Evaluation allowance exhausted: three attempts used. Report the remaining issue to the author; do not retry.");
  }
  const persist = async (value: unknown) => {
    await writeFile(`${receipt}.tmp`, JSON.stringify(value, null, 2));
    await rename(`${receipt}.tmp`, receipt);
  };
  await persist({ attempt, lessonIds });
  let report: EvaluationReport;
  try { report = await run(root, lessonIds, config, signal); }
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
