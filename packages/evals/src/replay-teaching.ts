import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { evaluationConfiguration, executeEvaluationWorker } from "@dojofoo/authoring/evaluation/host";
import type { EvaluationReport } from "@dojofoo/authoring/evaluation/run";
import { restoreMaterial } from "./accepted-material";

// Reuse the shipped evaluator and exact learner fixture, not another teaching harness.
const source = process.argv[2];
if (!source || !process.argv.includes("--live")) {
  throw new Error("Usage: tsx src/replay-teaching.ts <evaluation-directory> --live [--trial <recorded-trial-directory>] (paid production teacher and judges; no authoring run)");
}
const directory = resolve(source);
const previous: EvaluationReport = JSON.parse(await readFile(join(directory, "report.json"), "utf8"));
// A thrown trial never returns its directory to the report. Allow explicitly
// selecting its retained evidence without modifying the original failure.
const trialFlag = process.argv.indexOf("--trial");
const trialDirectory = trialFlag < 0 ? previous.trialDirectory : process.argv[trialFlag + 1];
if (!trialDirectory || trialDirectory.startsWith("--")) throw new Error("Replay requires a recorded teaching trial");
const evidence = JSON.parse(await readFile(join(trialDirectory, "evidence.json"), "utf8"));
const learnerPath: string | undefined = evidence[0]?.learnerPath;
if (!learnerPath) throw new Error("Replay requires the trial's original learner fixture");
const config = evaluationConfiguration();
if (!config) throw new Error("Select teaching and learner models before replaying");
const root = await mkdtemp(join(tmpdir(), "dojo-teaching-replay-"));
await restoreMaterial(root, JSON.parse(await readFile(join(directory, "material.json"), "utf8")));
await writeFile(join(root, "replay-source.json"), JSON.stringify({ directory, trialDirectory, learnerPath, lessonIds: previous.lessonIds }, null, 2));
process.env.DOJOFOO_EVAL_FIXTURE_PATH = learnerPath;
console.info(`Replaying the recorded lesson and learner fixture in ${root}`);
const report = await executeEvaluationWorker(root, previous.lessonIds, config, AbortSignal.timeout(2_160_000));
console.info(JSON.stringify({ root, directory: report.directory, status: report.status, error: report.error,
  panels: [report.material, report.teaching].map(panel => panel?.map(({ judge, verdict }) => ({
    judge, overall: verdict.overall, failures: verdict.criteria.filter(criterion => !criterion.pass),
  }))),
}, null, 2));
if (report.status !== "passed" || [report.material, report.teaching].some(panel =>
  panel?.length !== 2 || panel.some(({ verdict }) => verdict.overall !== "pass"))) process.exitCode = 1;
