import { spawn } from "node:child_process";
import { access, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createKyoshiRuntime } from "@dojofoo/authoring/eve/runtime";
import { scaffoldAuthoringWorkspace } from "@dojofoo/authoring/scaffold";

const live = process.argv.includes("--live");
const localJudges = process.argv.includes("--local-judges");
const chained = process.argv.includes("--chained");
const revise = process.argv.includes("--revise");
const workflow = process.argv.includes("--workflow");
const quick = process.argv.includes("--quick");
if (workflow && (!live || !localJudges)) throw new Error("--workflow requires --live --local-judges (paid production evaluations)");
if (chained && !localJudges) throw new Error("--chained requires --local-judges");
if (revise && !chained) throw new Error("--revise requires --chained (one bounded material revision pass)");
if (live && !localJudges && !process.env.DOJOFOO_EVAL_JUDGE) {
  throw new Error("Set DOJOFOO_EVAL_JUDGE to an AI Gateway model. The judge is separate from the local harness.");
}
if (live && !localJudges && !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
  throw new Error("The Eve judge requires AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN.");
}
const cli = resolve(dirname(fileURLToPath(import.meta.resolve("@dojofoo/agent/eve/package.json"))), "bin/eve.js");
const dojoCli = process.env.DOJO_CLI ?? resolve(import.meta.dirname, "../../cli/dist/index.js");
if (live && (chained || workflow)) await access(dojoCli);
const root = await mkdtemp(resolve(tmpdir(), "dojofoo-kyoshi-eval-"));
let runtime: Awaited<ReturnType<typeof createKyoshiRuntime>> | undefined;
try {
  scaffoldAuthoringWorkspace({ root, name: "Kyoshi teaching baseline", style: "katas" });
  runtime = await createKyoshiRuntime(root, { model: process.env.DOJOFOO_EVAL_MODEL });
  const cwd = resolve(root, ".dojo/kyoshi-app/agents/kyoshi");
  await symlink(resolve(import.meta.dirname, "../authoring/evals"), resolve(cwd, "evals"), "dir");
  if (live) console.log(`Eval workspace and Eve reports retained for review: ${root}`);
  const target = live ? await runtime.start() : undefined;
  const args = target
    ? [workflow ? "authoring-workflow" : chained ? "authoring-chain" : localJudges ? "local-material" : "teaching", "--url", target.url, "--strict", "--max-concurrency", "1", "--timeout", workflow ? "5400000" : revise ? "1200000" : chained ? "900000" : localJudges ? "600000" : "300000"]
    : ["--list"];
  process.exitCode = await new Promise<number>((accept, reject) => {
    const child = spawn(process.execPath, [cli, "eval", ...args], {
      cwd, stdio: "inherit",
      env: { ...process.env, DOJOFOO_EVAL_CLI: dojoCli, DOJOFOO_EVAL_WORKSPACE: root, DOJOFOO_EVAL_WORKFLOW: workflow ? "1" : "0", DOJOFOO_EVAL_QUICK: quick ? "1" : "0", DOJOFOO_EVAL_LOCAL_JUDGES: localJudges ? "1" : "0", DOJOFOO_EVAL_REVISE: revise ? "1" : "0" },
    });
    child.once("error", reject);
    child.once("exit", (code) => accept(code ?? 1));
  });
} finally {
  await runtime?.close();
  if (!live) await rm(root, { recursive: true, force: true });
}
