import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startHostPortFixture } from "@dojofoo/harness/host-port/fixture";
import { createKyoshiRuntime } from "@dojofoo/agents/eve/runtime";
import { scaffoldAuthoringWorkspace } from "@dojofoo/agents/scaffold";
import { writeAgent } from "@dojofoo/config/runtime";
import { isAgentId, type EvaluationTrialStatus } from "@dojofoo/protocol";
import { postEvaluation } from "./ui-evaluation";

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
const cli = resolve(dirname(fileURLToPath(import.meta.resolve("@dojofoo/harness/eve/package.json"))), "bin/eve.js");
const dojoCli = process.env.DOJO_CLI ?? resolve(import.meta.dirname, "../../cli/dist/index.js");
if (live && (chained || workflow)) await access(dojoCli);
const root = await mkdtemp(resolve(tmpdir(), "dojofoo-kyoshi-eval-"));
let runtime: Awaited<ReturnType<typeof createKyoshiRuntime>> | undefined;
let ui: ChildProcess | undefined;
let hostPort: Awaited<ReturnType<typeof startHostPortFixture>> | undefined;

/** The built CLI's UI server for the workflow's evaluations, in the eval workspace with its own DOJOFOO_HOME */
async function startUiServer(): Promise<string> {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((done, fail) => reservation.close(error => error ? fail(error) : done()));
  const home = await mkdtemp(resolve(tmpdir(), "dojofoo-kyoshi-eval-home-"));
  ui = spawn(process.execPath, [dojoCli, "ui", "--authoring", "--no-open", "--no-portless", "--port", String(port)], {
    cwd: root, detached: process.platform !== "win32", stdio: "inherit",
    env: { ...process.env, DOJOFOO_HOME: home, DOJO_PROJECT_ROOT: root, HOST: "127.0.0.1" },
  });
  const origin = `http://127.0.0.1:${port}`;
  for (const deadline = Date.now() + 60_000; ;) {
    try { if ((await fetch(`${origin}/api/health`)).ok) return origin; } catch {}
    if (Date.now() > deadline) throw new Error("The UI server for the workflow's evaluations did not start");
    await new Promise(done => setTimeout(done, 250));
  }
}

/** A host port whose evaluation methods forward to the UI server's `POST /api/authoring/evals`, as the UI server's own do */
function forwardingHostPort(origin: string) {
  const trials = new Map<string, { status: EvaluationTrialStatus; controller: AbortController }>();
  const trialOf = (input: { trialId?: unknown }) => {
    const trial = typeof input?.trialId === "string" ? trials.get(input.trialId) : undefined;
    if (!trial) throw Object.assign(new Error("No such evaluation."), { status: 404, code: "trial_not_found" });
    return trial;
  };
  return startHostPortFixture({ handlers: {
    "evaluation.start": (input: { lessonIds: string[] }, call) => {
      const trialId = randomUUID();
      const trial = { status: { status: "running" } as EvaluationTrialStatus, controller: new AbortController() };
      trials.set(trialId, trial);
      void postEvaluation(origin, { lessonIds: input.lessonIds, callId: call.idempotencyKey }, trial.controller.signal).then(
        answer => { trial.status = answer.status === 200 ? { status: "finished", result: answer.body }
          : { status: "failed", error: answer.body?.error ?? `The evaluation answered ${answer.status}.`, ...(answer.body?.code ? { code: answer.body.code } : {}) }; },
        error => { trial.status = { status: "failed", error: error instanceof Error ? error.message : String(error) }; });
      return { trialId };
    },
    "evaluation.status": (input: { trialId?: unknown }) => trialOf(input).status,
    // Aborting the request cancels the trial (decision 27)
    "evaluation.cancel": (input: { trialId?: unknown }) => { trialOf(input).controller.abort(); return { ok: true }; },
  } });
}

try {
  scaffoldAuthoringWorkspace({ root, name: "Kyoshi teaching baseline", style: "katas" });
  // An eval parameter, saved where the Kyoshi runtime reads the workspace's agent
  const agent = process.env.DOJOFOO_EVAL_AGENT ?? "opencode";
  if (!isAgentId(agent)) throw new Error(`Unsupported coding agent: ${agent}`);
  writeAgent(root, agent);
  // The workflow's evaluations run in the UI server, which Kyoshi's tool reaches through the host port (step 7)
  const origin = live && workflow ? await startUiServer() : undefined;
  if (origin) {
    await mkdir(resolve(root, ".dojo"), { recursive: true });
    await writeFile(resolve(root, ".dojo/evaluation-settings.json"), JSON.stringify({ enabled: true }));
    hostPort = await forwardingHostPort(origin);
  }
  runtime = await createKyoshiRuntime(root, { model: process.env.DOJOFOO_EVAL_MODEL, ...(hostPort ? { hostPortUrl: hostPort.url } : {}) });
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
      env: { ...process.env, DOJOFOO_EVAL_CLI: dojoCli, DOJOFOO_EVAL_WORKSPACE: root, ...(origin ? { DOJOFOO_EVAL_UI: origin } : {}), DOJOFOO_EVAL_WORKFLOW: workflow ? "1" : "0", DOJOFOO_EVAL_QUICK: quick ? "1" : "0", DOJOFOO_EVAL_LOCAL_JUDGES: localJudges ? "1" : "0", DOJOFOO_EVAL_REVISE: revise ? "1" : "0" },
    });
    child.once("error", reject);
    child.once("exit", (code) => accept(code ?? 1));
  });
} finally {
  await runtime?.close();
  await hostPort?.close();
  if (ui?.pid) { try { process.kill(process.platform === "win32" ? ui.pid : -ui.pid, "SIGTERM"); } catch {} }
  if (!live) await rm(root, { recursive: true, force: true });
}
