import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { judgeMaterial } from "@dojofoo/authoring/evaluation/judges";
import { readTeachingEvidence } from "@dojofoo/authoring/evaluation/run";
import { teachingJudgePrompt } from "@dojofoo/authoring/evaluation/teaching-rubric";

const root = process.argv[2];
if (!root || !process.argv.includes("--live")) throw new Error("Usage: judge-handoff.ts <handoff-run-directory> --live (two paid local judge calls)");
const evidence = await readTeachingEvidence(root);
const results = await judgeMaterial(evidence, AbortSignal.timeout(400_000), teachingJudgePrompt);
await writeFile(resolve(root, "judge-results.json"), JSON.stringify(results, null, 2));
for (const result of results) console.log(result.judge, result.verdict.overall, result.verdict.criteria);
if (results.some(result => result.verdict.overall !== "pass")) process.exitCode = 1;
