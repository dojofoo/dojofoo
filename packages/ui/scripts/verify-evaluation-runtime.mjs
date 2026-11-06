import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, realpathSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// A whole course evaluation in the UI server (step-7 plan, "test:evaluation"): the built CLI's UI server, a managed draft with one kata
// lesson on OpenCode, the trial's Sensei through the learner's routes, and the fixture generator, simulated learner and both judge
// panels as one-shots on the same agent. Only inference is scripted locally.
const repo = fileURLToPath(new URL("../../..", import.meta.url));
const artifacts = await mkdtemp(join(tmpdir(), "dojo-evaluation-runtime-evidence-"));
console.log(`Evaluation runtime evidence: ${artifacts}`);
const artifact = name => join(artifacts, name);
const { startLoopbackModel } = await import(pathToFileURL(join(repo, "packages/harness/experiments/model-provider/loopback-openai.mjs")));
const { observeWorkspacePath } = await import(pathToFileURL(join(repo, "packages/config/dist/local-state.js")));
const scratch = await mkdtemp(join(tmpdir(), "dojo-evaluation-runtime-"));
const draft = join(scratch, "draft");
const stateHome = join(scratch, "state");
const lesson = "001-sum";
const marker = "SENSEI-GUIDANCE-MARKER";
const reviewReply = "REVIEW-REPLY: I start the total at zero so an empty list sums to nothing.";

// Each role is told by the first sentence of its prompt file (the judges' prompts are whole, so they carry theirs in the prompt)
const firstSentence = async name => (await readFile(join(repo, "packages/agents/src/evaluation/prompts", name), "utf8")).split("\n")[0].split(". ")[0];
const roles = {
  judge: [await firstSentence("MATERIAL-JUDGE.md"), await firstSentence("TEACHING-JUDGE.md")],
  fixture: await firstSentence("FIXTURE-GENERATOR.md"),
  learner: await firstSentence("LEARNER.md"),
};
const roleOf = input => {
  const text = JSON.stringify(input);
  if (roles.judge.some(sentence => text.includes(sentence))) return "judge";
  if (text.includes(roles.fixture)) return "fixture";
  if (text.includes(roles.learner)) return "learner";
  return "sensei";
};
const criteria = ["engagement", "learner-grounding", "adaptive-instruction", "solution-withholding", "review-transfer"];
const verdict = { criteria: criteria.map(id => ({ id, pass: true, evidence: `Observed ${id}.`, improvement: "None needed." })), overall: "pass", limitation: "A scripted fixture." };
const fixture = {
  uncertainty: "What should the total be before I add anything?",
  terminology: "What does accumulator mean in this lesson?",
  misconception: "I think an empty list has no total, so it should be one.",
  wrong: "export function sum(values: number[]): number {\n  return values.length ? values.reduce((total, value) => total + value) : 1;\n}\n",
  solved: "export function sum(values: number[]): number {\n  return values.reduce((total, value) => total + value, 0);\n}\n",
  review: "Why does the empty case matter here?",
};
/** The text of a Responses input item */
const textOf = item => typeof item?.content === "string" ? item.content
  : Array.isArray(item?.content) ? item.content.map(part => part.text ?? "").join("") : "";
/** The user items of the turn a Responses request continues, or none when it carries a tool result */
const turnInput = input => {
  const items = Array.isArray(input.input) ? input.input : [];
  const latest = items.findLastIndex(item => item.role === "user");
  if (latest < 0 || items.slice(latest).some(item => item.type === "function_call_output")) return "";
  const start = items.slice(0, latest).findLastIndex(item => item.role !== "user") + 1;
  return items.slice(start, latest + 1).map(textOf).join("\n");
};
// Sensei calls dojo_lesson_complete once on the success report's turn and once on the turn after the learner's review reply
const completion = { success: false, review: false };
const endpoint = await startLoopbackModel({
  respondText(input) {
    const role = roleOf(input);
    if (role === "judge") return JSON.stringify(verdict);
    if (role === "fixture") return JSON.stringify(fixture);
    if (role !== "learner") return undefined;
    const asked = (Array.isArray(input.input) ? input.input : []).filter(item => item.role === "user").map(textOf)
      .flatMap(text => { try { return [JSON.parse(text)]; } catch { return []; } }).find(value => Array.isArray(value?.questions));
    return asked ? JSON.stringify(Object.fromEntries(asked.questions.map(question => [question.id, [question.options[0]?.title ?? "I'm not sure."]]))) : reviewReply;
  },
  selectResponsesTool(input) {
    if (roleOf(input) !== "sensei") return undefined;
    const text = turnInput(input);
    const tool = (input.tools ?? []).find(candidate => candidate.name?.endsWith("dojo_lesson_complete"));
    if (!tool || !text) return undefined;
    if (!completion.success && text.includes("Ran lesson checks.") && text.includes('"complete":true')) completion.success = true;
    else if (completion.success && !completion.review && text.includes(reviewReply)) completion.review = true;
    else return undefined;
    return { name: tool.name, input: {} };
  },
});
const cli = join(repo, "packages/cli/dist/index.js");
// Model discovery runs `$OPENCODE_BIN models`; a fixed catalog keeps it the same on every machine (as test:lesson)
const discovery = join(scratch, "bin/opencode");
await mkdir(join(scratch, "bin"), { recursive: true });
await writeFile(discovery, '#!/bin/sh\n[ "$1" = models ] && printf "openai/gpt-4o\\nopenai/gpt-4o-mini\\n" && exit 0\nexit 1\n', { mode: 0o755 });
const environment = { ...process.env, DOJOFOO_HOME: stateHome, DO_NOT_TRACK: "1", OPENCODE_BIN: discovery, DOJOFOO_EVAL_TURN_INTERVAL_MS: "0",
  XDG_CONFIG_HOME: join(scratch, "config"), XDG_DATA_HOME: join(scratch, "data"), XDG_CACHE_HOME: join(scratch, "cache"),
  OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: endpoint.baseURL, AI_GATEWAY_API_KEY: "", VERCEL_OIDC_TOKEN: "", NODE_PATH: undefined, CI: "", TEST: "" };
delete environment.OPENCODE_CONFIG_CONTENT;
let server;
let output = "";
/** A long request: the evaluation answers only when the trial and both panels are done, past fetch's 300-second header timeout */
const post = (url, body) => new Promise((resolve, reject) => {
  const sent = httpRequest(url, { method: "POST", headers: { "content-type": "application/json" } }, response => {
    let text = "";
    response.setEncoding("utf8");
    response.on("data", chunk => { text += chunk; });
    response.on("end", () => resolve({ status: response.statusCode, body: text ? JSON.parse(text) : null }));
  });
  sent.setTimeout(15 * 60_000, () => sent.destroy(new Error("The evaluation did not answer within 15 minutes")));
  sent.on("error", reject);
  sent.end(JSON.stringify(body));
});
try {
  await mkdir(join(draft, "src", lesson), { recursive: true });
  const vitest = join(repo, "node_modules/vitest/vitest.mjs");
  await writeFile(join(draft, "dojo.yaml"), `mode: katas\nname: Evaluation fixture\nversion: 0.0.1\ndescription: Practice summing a list.\nlanguage: TypeScript\ntest: node "${vitest}" run --globals {template}\nkatas:\n  - name: ${lesson}\n    title: Sum a list\n    template: src/${lesson}/kata.ts\n`);
  await writeFile(join(draft, "README.md"), "# Sums\n\nYou build a function that totals a list of numbers.\n");
  await writeFile(join(draft, "DOJO.md"), "Teach summing from the learner's own attempts; the empty list is the case to understand.\n");
  await writeFile(join(draft, "src/INTRO.md"), "# Totals\n\nAdding up lists of numbers.\n");
  await writeFile(join(draft, "src", lesson, "INTRO.md"), "# Sum a list\n\nWrite `sum` so it totals any list, including an empty one.\n");
  await writeFile(join(draft, "src", lesson, "SENSEI.md"), `# Sum a list\n\nThe learner may think an empty list has no total. Ask what the total is before anything is added, and let them find that it starts at zero. ${marker}\n`);
  await writeFile(join(draft, "src", lesson, "kata.ts"), 'export function sum(values: number[]): number {\n  throw new Error("Add the values");\n}\n');
  await writeFile(join(draft, "src", lesson, "kata.test.ts"), 'import { sum } from "./kata";\ntest("adds the values", () => expect(sum([1, 2, 3])).toBe(6));\ntest("an empty list sums to zero", () => expect(sum([])).toBe(0));\n');
  await mkdir(join(draft, ".dojo"), { recursive: true });
  await writeFile(join(draft, ".dojo/runtimes.json"), JSON.stringify({ agent: "opencode", models: { opencode: "openai/gpt-4o" } }));
  await writeFile(join(draft, ".dojo/evaluation-settings.json"), JSON.stringify({ enabled: true }));
  const draftId = observeWorkspacePath(draft, { stateHome, kind: "draft" });
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [cli, "ui", "--authoring", "--no-open", "--no-portless", "--port", String(port)], {
    cwd: draft, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
    env: { ...environment, DOJO_PROJECT_ROOT: draft, HOST: "127.0.0.1" },
  });
  server.stdout.on("data", chunk => { output += chunk; });
  server.stderr.on("data", chunk => { output += chunk; });
  for (const deadline = Date.now() + 60_000; ;) {
    try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error("The UI server did not start");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const ready = await fetch(`${origin}/api/authoring/draft?workspace=${encodeURIComponent(draftId)}`).then(response => response.json());
  assert.deepEqual(ready.lessons.map(item => item.checks.filter(check => !check.ready).map(check => check.id)), [[]], "the fixture lesson must be ready to evaluate");
  const opencodeProcesses = () => execFileSync("ps", ["-axww", "-o", "pid=,command="], { encoding: "utf8" }).split("\n")
    .filter(line => line.includes(".harness-bootstrap/opencode")).map(line => Number(line.trim().split(/\s+/u)[0]));
  const foreignOpencode = new Set(opencodeProcesses());
  const evaluate = () => post(`${origin}/api/authoring/evals?workspace=${encodeURIComponent(draftId)}`, { lessonIds: [lesson], callId: "evaluation-1" });

  // 1. The evaluation answers its receipt: a passing report on the first attempt, with two judges in both panels
  const started = Date.now();
  const first = await evaluate();
  console.log(`The evaluation answered in ${Math.round((Date.now() - started) / 1000)} s`);
  await writeFile(artifact("receipt.json"), JSON.stringify(first.body, null, 2));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.report.status, "passed", JSON.stringify(first.body.report));
  assert.equal(first.body.attempt, 1);
  assert.equal(first.body.remaining, 2);
  for (const panel of ["material", "teaching"]) assert.deepEqual(first.body.report[panel].map(result => result.judge), ["judge-1", "judge-2"]);

  // 2. The trial's evidence: every stage, two completion choices, a passed lifecycle; the session's instructions carry the lesson
  const trialDirectory = first.body.report.trialDirectory;
  const evidence = JSON.parse(await readFile(join(trialDirectory, "evidence.json"), "utf8"));
  await writeFile(artifact("evidence.json"), JSON.stringify(evidence, null, 2));
  for (const stage of ["introduction", "uncertainty", "unfamiliar-terminology", "misconception", "failure-1", "failure-2", "frustration", "independence", "success", "review"]) {
    assert.ok(evidence.some(entry => entry.stage === stage && entry.parts?.some(part => part.type === "text-delta" && part.delta.trim())), `stage ${stage} has no Sensei text`);
  }
  assert.equal(evidence.filter(entry => entry.completionChoices).length, 2);
  assert.deepEqual(evidence.at(-1), { deterministicLifecycle: "passed" });
  assert.match(await readFile(join(trialDirectory, `${lesson}-instructions.md`), "utf8"), new RegExp(marker, "u"));

  // 3. Sensei's requests carried the lesson's guidance; the simulated learner's never did
  const byRole = role => endpoint.requests.filter(request => roleOf(request) === role);
  assert.ok(byRole("sensei").some(request => JSON.stringify(request).includes(marker)), "no Sensei request carried the lesson guidance");
  assert.ok(byRole("learner").length > 0, "the simulated learner was never asked");
  for (const request of [...byRole("learner"), ...byRole("fixture")]) assert.doesNotMatch(JSON.stringify(request), new RegExp(marker, "u"));
  assert.equal(byRole("judge").length >= 4, true, "two panels of two judges");

  // 4. The trial's Sensei conversation is a lesson's, and its messages went through the pre-delivery hook
  const trialWorkspace = evidence.find(entry => entry.trialWorkspace)?.trialWorkspace;
  const workspaces = await fetch(`${origin}/api/control/snapshot`).then(response => response.json());
  const trialId = workspaces.workspaces.find(workspace => existsSync(workspace.path) && realpathSync(workspace.path) === realpathSync(trialWorkspace))?.id;
  assert.ok(trialId, `the trial's workspace ${trialWorkspace} is not among ${JSON.stringify(workspaces.workspaces?.map(workspace => workspace.path))}`);
  const sessions = (await fetch(`${origin}/api/v1/workspaces/${encodeURIComponent(trialId)}/sessions?persona=sensei`).then(response => response.json())).data;
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].persona, "sensei");
  assert.equal(sessions[0].lessonId, lesson);
  assert.ok(sessions[0].courseId);
  assert.ok(sessions[0].firstMessage, "the learner's messages did not go through the pre-delivery hook");

  // 5. Nothing of the trial is left running, and the dashboard lists none of its courses
  await (async () => { for (const deadline = Date.now() + 15_000; opencodeProcesses().some(pid => !foreignOpencode.has(pid)) && Date.now() < deadline;) await new Promise(resolve => setTimeout(resolve, 250)); })();
  assert.deepEqual(opencodeProcesses().filter(pid => !foreignOpencode.has(pid)), [], "an OpenCode process of the trial is still running");
  // The record is a log of added and removed groups, emptied at the host's next start: every group it added was removed
  const record = join(stateHome, "state/processes", `${trialId}.sensei.jsonl`);
  const live = new Set();
  for (const line of existsSync(record) ? (await readFile(record, "utf8")).split("\n").filter(Boolean) : []) {
    const entry = JSON.parse(line);
    if (entry.op === "add") live.add(entry.pid); else live.delete(entry.pid);
  }
  assert.deepEqual([...live], [], "the trial's process record still holds a running group");
  const courses = await fetch(`${origin}/api/control/courses`).then(response => response.json());
  assert.deepEqual(courses.filter(course => course.workspaceId === trialId), []);

  // 6. The same call again replays the saved receipt without any inference
  const requests = endpoint.requests.length;
  const again = await evaluate();
  assert.equal(again.status, 200);
  assert.deepEqual(again.body, first.body);
  assert.equal(endpoint.requests.length, requests, "the replay reached the model");
  await writeFile(artifact("native-requests.json"), JSON.stringify(endpoint.requests, null, 2));
  console.log("Course evaluation in the UI server: a passing report from a whole trial on OpenCode, fixtures, the simulated learner and both judge panels as one-shots, the guidance kept from the learner, the trial's host stopped and the receipt replayed passed.");
} catch (error) {
  console.error(output);
  const logs = join(scratch, "data/opencode/log");
  const tails = await readdir(logs).then(names => Promise.all(names.map(async name => `== ${name}\n${(await readFile(join(logs, name), "utf8")).split("\n").slice(-200).join("\n")}`)), () => []);
  await writeFile(artifact("opencode-log-tail.txt"), tails.join("\n"));
  await writeFile(artifact("native-requests.json"), JSON.stringify(endpoint.requests, null, 2));
  await writeFile(artifact("server.log"), output);
  await cp(join(draft, ".dojo/handoffs"), artifact("handoffs"), { recursive: true }).catch(() => {});
  throw error;
} finally {
  await stopServer();
  await endpoint.close();
  // A native process the server's stop is still reaping can write into the scratch directory for a moment
  await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(error => console.warn(`Could not remove ${scratch}: ${error.message}`));
}

async function stopServer() {
  if (!server?.pid || server.exitCode !== null || server.signalCode !== null) return;
  const child = server;
  const group = child.pid;
  const closed = once(child, "close");
  const kill = signal => {
    try { if (process.platform === "win32") child.kill(signal); else process.kill(-group, signal); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  const timer = setTimeout(() => kill("SIGKILL"), 5_000);
  try { kill("SIGTERM"); await closed; }
  finally {
    clearTimeout(timer);
    if (process.platform !== "win32") {
      const members = execFileSync("ps", ["-axo", "pid=,pgid="], { encoding: "utf8" }).trim().split("\n")
        .map(line => line.trim().split(/\s+/).map(Number)).filter(([, id]) => id === group);
      for (const [pid] of members) { try { process.kill(pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; } }
    }
  }
}
