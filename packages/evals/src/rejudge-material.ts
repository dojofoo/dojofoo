import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { judgeMaterial } from "../authoring/evals/local-judges";

const path = process.argv[2];
if (!path || !process.argv.includes("--live")) throw new Error("Usage: tsx src/rejudge-material.ts <course> --live (two paid/local judge turns)");
const root = resolve(path);
const material = JSON.parse(await readFile(join(root, ".dojo/authored-material.json"), "utf8"));
const results = await judgeMaterial(material, AbortSignal.timeout(360_000));
await writeFile(join(root, ".dojo/judge-results.json"), JSON.stringify({ results }, null, 2));
for (const result of results) console.log(JSON.stringify({ judge: result.judge, root: result.root, verdict: result.verdict }));
if (results.some(({ verdict }) => verdict.overall !== "pass")) process.exitCode = 1;
