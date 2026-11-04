// Host-level conformance driver, run as a child process by conformance.fixture.ts
// (docs/designs/agent-runtime.steps/step-3.md and step-4.md, "conformance-host.mjs"):
//   node scripts/conformance-host.mjs <scenario> <agent> <root> [<model>] [--persona kyoshi|sensei] [--host-port <url>] [--workspace-id <id>]
//     [--session <id>] [--prompt <text>] [--inspect <id>] [--messages <n>] [--lessons <n>]
// It starts the persona's prepared host on exactly <agent>; the test process, where the loopback model and the host-port fixture run,
// makes the assertions. A scenario that must hold its host open waits for a line on stdin.
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { agentRow, isAgentId } from "@dojofoo/protocol";

// Step 6, both personas: a turn on a new or a named session, and a host that only starts and stops (the agent switched away to)
const switchScenarios = ["turn-on-session", "away"];
const scenarios = {
  kyoshi: ["ask-answer-across-restart", "cancel-pending-host-tool", "resume-after-eviction", "crash-after-park", "restart-only", ...switchScenarios,
    // Step 8, tier B: a cold start on the agent's default model and the user's login (no loopback)
    "tier-b-cold-start"],
  sensei: ["ask-answer-across-restart", "cancel-pending-host-tool", "resume-after-eviction", "crash-after-park", "restart-only",
    "host-tool-turn", "model-switch", "rerun-no-duplicate",
    // Step 5: a report during a working turn, a switch's cancel, a killed host whose turn is interrupted, a settle hook lost to a crash,
    // and the restarts that read what those left (`--session <id>`)
    "check-during-turn", "switch-during-turn", "interrupted-after-kill", "settle-hook-lost", "recover-session", "inspect-session", ...switchScenarios,
    // Step 7: an evaluation's one-shot roles on the agent (no host), and a trial's usage ceiling on its Sensei host
    "one-shot", "usage-ceiling",
    // Step 8, tier B: timed learner turns, begin turns that a leave cancels, and the turn the case samples memory during
    "tier-b-turns", "tier-b-begin-turns", "tier-b-memory"],
};
const argument = name => { const index = process.argv.indexOf(name); return index === -1 ? undefined : process.argv[index + 1]; };
const positional = process.argv.slice(2).filter((value, index, all) => !value.startsWith("--") && !all[index + 1 - 1 - 1]?.startsWith("--"));
const [scenario, agent, root, model] = positional;
const persona = argument("--persona") ?? "kyoshi";
const hostPortUrl = argument("--host-port");
const workspaceId = argument("--workspace-id");
const sessionArgument = argument("--session");
if (!existsSync(new URL("../dist/eve/runtime.js", import.meta.url))) {
  console.error('Build authoring first: pnpm --filter "@dojofoo/agents..." build');
  process.exit(2);
}
if (!scenarios[persona]?.includes(scenario) || !isAgentId(agent) || !agentRow(agent).adapterId || !root) {
  console.error("usage: conformance-host.mjs <scenario> <agent with an adapter> <root> [<model>] [--persona kyoshi|sensei] [--host-port <url>] [--workspace-id <id>]");
  process.exit(2);
}
const { createKyoshiRuntime } = await import("../dist/eve/runtime.js");
const { createSenseiRuntime } = await import("../dist/sensei/runtime.js");
const { Client } = await import("@dojofoo/harness/client");
const result = value => console.log(`CONFORMANCE_RESULT ${JSON.stringify(value)}`);
const app = persona === "kyoshi" ? ".dojo/kyoshi-app/agents/kyoshi" : ".dojo/sensei-app/agents/sensei";
const start = async options => {
  const target = { agent, ...(workspaceId ? { workspaceId } : {}), ...(hostPortUrl ? { hostPortUrl } : {}), ...options };
  const runtime = persona === "kyoshi" ? await createKyoshiRuntime(root, target) : await createSenseiRuntime(root, target);
  const started = await runtime.start();
  const configuration = JSON.parse(await readFile(join(root, app, "runtime.json"), "utf8"));
  result({ step: "started", harness: configuration.harness, secret: started.secret });
  return { runtime, started, client: new Client({ baseUrl: started.url, auth: started.auth }) };
};
/** Native processes of this case still running (their command names the case root or the harness bootstrap), not this driver's */
const caseProcesses = () => {
  const bootstrap = join(process.env.HOME ?? root, ".ai-sdk-harness");
  const markers = [root, ...(existsSync(bootstrap) ? [realpathSync(bootstrap)] : [])];
  try {
    return execFileSync("ps", ["-axww", "-o", "pid=,command="], { encoding: "utf8" }).split("\n")
      .filter(line => markers.some(marker => line.includes(marker)) && !line.includes("conformance-host.mjs") && !line.includes(".output/server/index.mjs"))
      .map(line => line.trim().slice(0, 300));
  } catch (error) { return [`ps failed: ${String(error)}`]; }
};
const lines = createInterface({ input: process.stdin });
const received = [];
const listeners = [];
lines.on("line", line => { received.push(line.trim()); for (const listener of listeners) listener(); });
const waitForLine = expected => new Promise(resolve => {
  const check = () => { if (received.includes(expected)) resolve(); };
  listeners.push(check);
  check();
});
const turn = () => AbortSignal.timeout(120_000);
/** Each stdin line that starts with `prefix`, as it arrives */
const onLines = (prefix, handle) => {
  let seen = 0;
  listeners.push(() => {
    for (; seen < received.length; seen++) if (received[seen].startsWith(prefix)) void handle(received[seen].slice(prefix.length));
  });
};
/** A server turn as the UI server posts one: the message with its idempotency key and turn policy (fact 11) */
async function post(started, sessionId, body) {
  const authorization = `Basic ${Buffer.from(`${started.auth.basic.username}:${started.auth.basic.password}`).toString("base64")}`;
  const response = await fetch(`${started.url.replace(/\/$/u, "")}/eve/v1/session/${encodeURIComponent(sessionId)}`, {
    method: "POST", headers: { authorization, "content-type": "application/json" }, body: JSON.stringify(body), signal: turn() });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
/** Polls the session until `test` holds for its events */
async function until(client, sessionId, test, timeoutMs = 90_000) {
  for (const deadline = Date.now() + timeoutMs; Date.now() < deadline; await new Promise(resolve => setTimeout(resolve, 200))) {
    const { events } = await client.sessions.attach(sessionId).snapshot({ signal: AbortSignal.timeout(10_000) });
    const found = test(events);
    if (found) return found;
  }
  const { events } = await client.sessions.attach(sessionId).snapshot({ signal: AbortSignal.timeout(10_000) }).catch(() => ({ events: [] }));
  throw new Error(`The session did not reach the expected state in time: ${JSON.stringify(events.map(event => [event.type, event.data?.outcome ?? event.data?.status ?? ""]))}`);
}
/** A conversation as the UI server opens it for either persona: a bodyless create, then its first message (step-6 plan, decision 26) */
async function open(client, message) {
  const { session } = await client.sessions.create({ signal: turn() });
  return { session, delivery: await session.send(message, { signal: turn() }) };
}
const firstPrompt = persona === "kyoshi" ? "Help me author a course." : "Introduce the lesson.";
const settledTurn = (events, outcome) => events.find(event => event.type === "turn.settled" && (!outcome || event.data.outcome === outcome));
/** The tokens Eve recorded in `events`, summed */
const usageOf = events => events.filter(event => event.type === "usage.recorded").reduce((sum, event) => Object.fromEntries(
  Object.entries(sum).map(([key, value]) => [key, value + (event.data?.usage?.[key] ?? 0)])), { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
/** Tier B's learner messages, in order (step-8 plan, "Tier-B cases") */
const learnerMessages = ["What does the first test check?", "Explain the lesson's objective in two sentences.", "Which file should I edit?",
  "What is a good first step?", "Give me a hint without code."];
/** The begin turn the UI server sends a new Sensei session: `[dojo:begin]` and TURNS.md's begin (ui/src/server/agent-session/default.ts) */
async function beginMessage() {
  const { promptSection, promptSections, readPrompt, renderPrompt } = await import("../dist/prompts.js");
  const { dojoTags, tagged } = await import("@dojofoo/protocol");
  return tagged(dojoTags.begin, renderPrompt(promptSection(promptSections(readPrompt("sensei/contracts/TURNS.md")), "begin")));
}
/** One message on `session`, timed from its send to the first assistant text in Eve's event stream (a text part's first record) and to
 *  its settlement; the delivery's status and error, and the tokens Eve recorded for it */
async function timedTurn(session, message) {
  const sent = Date.now();
  const delivery = await session.send(message, { signal: turn() });
  let firstOutputMs = null;
  const events = [];
  for await (const event of delivery.stream({ signal: turn() })) {
    events.push(event);
    if (firstOutputMs === null && (event.type === "content.delta" || event.type === "content.completed") && event.data?.kind === "text") firstOutputMs = Date.now() - sent;
  }
  const ms = Date.now() - sent;
  const replied = await delivery.result({ signal: turn() });
  return { status: replied.status, ms, firstOutputMs, error: replied.error ?? null, usage: usageOf(events) };
}
let runtime;
// The client and session a failure's event dump reads
let latest;
try {
  if (scenario === "one-shot") {
    // An evaluation's roles (step-7 plan, "Conformance cases"): the learner, the fixture generator and a teaching judge, each one
    // tool-free read-only call on this agent in this driver's environment, with no host. Each reports its text and what it left running.
    const { oneShot } = await import("@dojofoo/harness/adapters");
    const { learnerPrompt } = await import("../dist/evaluation/learner.js");
    const { fixturePrompt } = await import("../dist/evaluation/learner-fixtures.js");
    const { fixtureGeneratorInstructions, teachingJudgePrompt } = await import("../dist/evaluation/prompts/index.js");
    const { judgeSchema } = await import("../dist/evaluation/judges.js");
    const material = { "dojo.yaml": "katas:\n  - name: first\n    template: src/first/kata.ts\n", "src/first/SENSEI.md": "SENSEI-GUIDANCE-MARKER",
      "src/first/kata.ts": "export const total = (values: number[]) => 0;\n" };
    const learner = learnerPrompt({ dialogue: [{ role: "assistant", content: "What should the total be before anything is added?" }], source: material["src/first/kata.ts"] });
    const roles = [
      { role: "learner", instructions: learner.instructions, prompt: learner.prompt },
      { role: "fixture", instructions: fixtureGeneratorInstructions, prompt: fixturePrompt({ lessonId: "first", completedBefore: [], material }) },
      { role: "judge", prompt: teachingJudgePrompt({ transcript: "[]", "first-instructions.md": "SENSEI-GUIDANCE-MARKER" }, judgeSchema) },
    ];
    for (const [index, call] of roles.entries()) {
      const began = Date.now();
      const { text, usage } = await oneShot({ agent, ...(model ? { model } : {}), ...(call.instructions ? { instructions: call.instructions } : {}), prompt: call.prompt,
        directory: join(root, "one-shot", String(index)), stateDirectory: join(root, "one-shot-state"), environment: process.env,
        signal: turn(), timeoutMs: 120_000 });
      result({ step: "one-shot", role: call.role, text, processes: caseProcesses(), ms: Date.now() - began, usage });
    }
    process.exit(0);
  }
  if (scenario === "usage-ceiling") {
    // A trial's Sensei: a ceiling of one output token, so the first message spends it and the second opens Eve's budget prompt
    const first = await start({ ...(model ? { model } : {}), usageCeiling: { newInputTokens: 1_000_000_000, outputTokens: 1 } });
    runtime = first.runtime;
    latest = { client: first.client };
    const created = await open(first.client, firstPrompt);
    const sessionId = created.session.state.sessionId;
    latest.state = () => ({ sessionId });
    const budget = events => events.find(event => event.type === "interaction.opened" && event.data?.request?.kind === "budget");
    const replied = await created.delivery.result({ signal: turn() });
    const afterFirst = (await first.client.sessions.attach(sessionId).snapshot({ signal: turn() })).events;
    result({ step: "first", status: replied.status, reply: replied.reply, budget: Boolean(budget(afterFirst)), sessionId });
    await waitForLine("second");
    await first.client.sessions.attach(sessionId).send("Continue the lesson.", { signal: turn() });
    const settledBefore = afterFirst.filter(event => event.type === "turn.settled").length;
    const opened = await until(first.client, sessionId, events => budget(events)
      ?? (events.filter(event => event.type === "turn.settled").length > settledBefore ? { settled: true } : undefined));
    const paused = opened.settled ? undefined : await until(first.client, sessionId, events => events.findLast(event => event.type === "turn.paused"));
    result({ step: "second", budget: !opened.settled, budgetPromptOnMessage: opened.settled ? null : 2, turnId: paused?.data.turnId ?? null });
    if (paused) {
      await first.client.sessions.attach(sessionId).cancel({ turnId: paused.data.turnId, signal: turn() });
      const settled = await until(first.client, sessionId, events => events.find(event => event.type === "turn.settled" && event.data.turnId === paused.data.turnId));
      result({ step: "cancelled", outcome: settled.data.outcome });
    }
    await runtime.close();
    runtime = undefined;
    result({ step: "closed", processes: caseProcesses() });
    process.exit(0);
  }
  if (scenario === "tier-b-cold-start") {
    // Kyoshi on a real model (step-8 plan, "Tier-B cases"): host start to ready, then one message to its first output
    const began = Date.now();
    const cold = await start(model ? { model } : {});
    const startToReadyMs = Date.now() - began;
    runtime = cold.runtime;
    latest = { client: cold.client };
    const { session } = await cold.client.sessions.create({ signal: turn() });
    latest.state = () => ({ sessionId: session.state.sessionId });
    result({ step: "cold-start", startToReadyMs, ...await timedTurn(session, "List this draft's lesson files. Do not change any file.") });
    await runtime.close();
    runtime = undefined;
    result({ step: "closed", processes: caseProcesses() });
    process.exit(0);
  }
  if (scenario === "tier-b-turns" || scenario === "tier-b-begin-turns" || scenario === "tier-b-memory") {
    const host = await start(model ? { model } : {});
    runtime = host.runtime;
    latest = { client: host.client };
    if (scenario === "tier-b-turns") {
      // A learner's session: its begin turn, then `--messages <n>` messages, each timed to its first text
      const { session } = await host.client.sessions.create({ signal: turn() });
      latest.state = () => ({ sessionId: session.state.sessionId });
      result({ step: "turn", phase: "begin", ...await timedTurn(session, await beginMessage()) });
      for (let index = 0; index < Number(argument("--messages") ?? 1); index++) {
        const message = learnerMessages[index % learnerMessages.length];
        result({ step: "turn", phase: "message", message, ...await timedTurn(session, message) });
      }
    } else if (scenario === "tier-b-begin-turns") {
      // `--lessons <n>` sessions opened in quick succession with their begin turns; all but the last cancelled while working, the cancel
      // the leave rule sends for a left lesson's working begin (design, "Sessions and leaving"). The case counts native processes.
      const begin = await beginMessage();
      const opened = [];
      for (let index = 0; index < Number(argument("--lessons") ?? 3); index++) opened.push(await open(host.client, begin));
      const ids = opened.map(({ session }) => session.state.sessionId);
      latest.state = () => ({ sessionId: ids.at(-1) });
      const turnIds = [];
      for (const sessionId of ids) turnIds.push(await until(host.client, sessionId, events => events.find(event => event.type === "turn.started")?.data.turnId));
      result({ step: "working", sessions: ids });
      await waitForLine("cancel");
      const cancelled = await Promise.all(ids.slice(0, -1).map(async (sessionId, index) => {
        const began = Date.now();
        await host.client.sessions.attach(sessionId).cancel({ turnId: turnIds[index], signal: turn() });
        const settled = await until(host.client, sessionId, events => events.find(event => event.type === "turn.settled" && event.data.turnId === turnIds[index]), 30_000);
        return { sessionId, outcome: settled.data.outcome, ms: Date.now() - began };
      }));
      result({ step: "cancelled", sessions: cancelled });
      const last = await opened.at(-1).delivery.result({ signal: turn() });
      const sessions = [];
      for (const sessionId of ids) {
        const { events } = await host.client.sessions.attach(sessionId).snapshot({ signal: turn() });
        sessions.push({ sessionId, outcome: settledTurn(events)?.data.outcome ?? null, usage: usageOf(events) });
      }
      result({ step: "settled", lastStatus: last.status, sessions });
      await waitForLine("done");
    } else {
      // The case reads the host's memory at "ready" and after "turned", and samples the native processes' between "begun" and "turned"
      result({ step: "ready" });
      await waitForLine("begin");
      const { session } = await host.client.sessions.create({ signal: turn() });
      latest.state = () => ({ sessionId: session.state.sessionId });
      result({ step: "begun", ...await timedTurn(session, await beginMessage()) });
      result({ step: "turned", ...await timedTurn(session, learnerMessages[0]) });
      await waitForLine("done");
    }
    await runtime.close();
    runtime = undefined;
    result({ step: "closed", processes: caseProcesses() });
    process.exit(0);
  }
  const first = await start(model ? { model } : {});
  runtime = first.runtime;
  latest = { client: first.client };
  if (scenario === "recover-session" || scenario === "inspect-session") {
    // A restarted host for a session the killed host left: Eve recovers its run at start, or finds it settled
    latest.state = () => ({ sessionId: sessionArgument });
    if (scenario === "recover-session") {
      // Eve recovers the run when its world redelivers the interrupted step, which may come later than this bound: then it stays open
      const settled = await until(first.client, sessionArgument, events => events.find(event => event.type === "turn.settled" && event.data.turnId === argument("--turn")), 30_000)
        .catch(() => undefined);
      result({ step: "recovered", outcome: settled?.data.outcome ?? "open", error: settled?.data.error ?? null });
    } else {
      const { activeTurn, emptySessionView, foldEvents } = await import("@dojofoo/harness/events");
      const { events } = await first.client.sessions.attach(sessionArgument).snapshot({ signal: turn() });
      result({ step: "inspected", active: activeTurn(foldEvents(emptySessionView(), events))?.turnId ?? null,
        settled: events.filter(event => event.type === "turn.settled").map(event => event.data.outcome) });
    }
    // Long enough for a hook Eve might run again to reach the host port
    await sleep(3_000);
    await runtime.close();
    runtime = undefined;
    result({ step: "closed", processes: caseProcesses() });
    process.exit(0);
  }
  if (scenario === "away") {
    // The agent the workspace switched to and away from again: it starts on the same case root and is never sent a message
    result({ step: "away-started" });
    await waitForLine("away-checked");
    await runtime.close();
    runtime = undefined;
    result({ step: "closed", processes: caseProcesses() });
    process.exit(0);
  }
  if (scenario === "turn-on-session") {
    // One turn: on the session `--session` names, or on a new conversation; with `--inspect`, another session's settled turns too
    const prompt = argument("--prompt") ?? firstPrompt;
    const settledIds = events => events.filter(event => event.type === "turn.settled").map(event => event.data.turnId);
    const earlier = sessionArgument ? settledIds((await first.client.sessions.attach(sessionArgument).snapshot({ signal: turn() })).events) : [];
    const created = sessionArgument ? undefined : await open(first.client, prompt);
    const sessionId = sessionArgument ?? created.session.state.sessionId;
    latest.state = () => ({ sessionId });
    const delivery = created?.delivery ?? await first.client.sessions.attach(sessionId).send(prompt, { signal: turn() });
    const replied = await delivery.result({ signal: turn() });
    const settled = await until(first.client, sessionId, events => events.find(event => event.type === "turn.settled" && event.data.outcome === "completed"
      && !earlier.includes(event.data.turnId)));
    result({ step: "turned", sessionId, turnId: settled.data.turnId, status: replied.status, reply: replied.reply });
    const inspect = argument("--inspect");
    if (inspect) result({ step: "inspected", sessionId: inspect, settled: settledIds((await first.client.sessions.attach(inspect).snapshot({ signal: turn() })).events) });
    await runtime.close();
    runtime = undefined;
    result({ step: "closed", processes: caseProcesses() });
    process.exit(0);
  }
  if (scenario === "restart-only") {
    await runtime.close();
    runtime = undefined;
    result({ step: "closed" });
    process.exit(0);
  }
  const created = await open(first.client, firstPrompt);
  const state = () => created.session.state;
  latest.state = state;
  if (scenario === "ask-answer-across-restart" || scenario === "crash-after-park") {
    const parked = await created.delivery.result({ signal: turn() });
    result({ step: "parked", status: parked.status,
      interactions: parked.interactions.map(({ interactionId, request }) => ({ interactionId, prompt: request.prompt })), state: state() });
    if (scenario === "crash-after-park") await new Promise(() => {});   // the test kills this process group
    await runtime.close();
    runtime = undefined;
    // What the closed host left running (the next start reaps a crashed host's recorded groups)
    result({ step: "closed", processes: caseProcesses() });
    const second = await start({});
    runtime = second.runtime;
    latest.client = second.client;
    const session = second.client.sessions.attach(state().sessionId, state());
    // Kyoshi answers the question's option; Sensei's learner answers by typing in the composer, a plain message
    const delivery = persona === "kyoshi"
      ? await session.respond([{ interactionId: parked.interactions[0]?.interactionId, optionId: "Beginner" }], { signal: turn() })
      : await session.send("Beginner", { signal: turn() });
    result({ step: "responded", deliveryId: delivery.deliveryId });
    const answered = await delivery.result({ signal: turn() });
    result({ step: "answered", status: answered.status, reply: answered.reply, sessionId: state().sessionId });
    if (argument("--debug")) {
      const { events } = await second.client.sessions.attach(state().sessionId).snapshot({ signal: turn() });
      console.log("DEBUG_EVENTS", JSON.stringify(events.map(event => [event.type, event.data])).slice(0, 15000));
    }
  } else if (scenario === "cancel-pending-host-tool" || scenario === "resume-after-eviction") {
    // Kyoshi parks on its question; Sensei's dojo_context call waits on the host-port fixture until this cancel
    if (persona === "kyoshi") await created.delivery.result({ signal: turn() });
    const turnId = persona === "kyoshi"
      ? await until(first.client, state().sessionId, events => events.findLast(event => event.type === "turn.paused")?.data.turnId)
      : await until(first.client, state().sessionId, events => events.find(event => event.type === "call.started")?.scope?.turnId);
    await first.client.sessions.attach(state().sessionId).cancel({ turnId, signal: turn() });
    await until(first.client, state().sessionId, events => settledTurn(events, "cancelled"));
    result({ step: "cancelled", turnId, sessionId: state().sessionId });
    if (scenario === "resume-after-eviction") {
      await waitForLine("continue");
      const continued = await (await first.client.sessions.attach(state().sessionId).send("Continue the lesson.", { signal: turn() })).result({ signal: turn() });
      result({ step: "continued", status: continued.status, reply: continued.reply });
    }
    // The test counts native processes while this host still runs
    await waitForLine("done");
  } else if (scenario === "host-tool-turn") {
    const replied = await created.delivery.result({ signal: turn() });
    result({ step: "replied", status: replied.status, reply: replied.reply, sessionId: state().sessionId });
  } else if (scenario === "model-switch") {
    const firstReply = await created.delivery.result({ signal: turn() });
    result({ step: "first", status: firstReply.status, reply: firstReply.reply, sessionId: state().sessionId });
    await waitForLine("switched");
    const secondReply = await (await first.client.sessions.attach(state().sessionId).send("Continue with the newly selected model.", { signal: turn() }))
      .result({ signal: turn() });
    result({ step: "second", status: secondReply.status, reply: secondReply.reply, sessionId: state().sessionId });
  } else if (scenario === "check-during-turn") {
    // The first turn is held by the loopback; the case sends each report (`report:<json>`) when the UI server would
    const turnId = await until(first.client, state().sessionId, events => events.find(event => event.type === "turn.started")?.data.turnId);
    result({ step: "working", turnId, sessionId: state().sessionId });
    onLines("report:", async line => {
      const { text, key } = JSON.parse(line);
      const sent = await post(first.started, state().sessionId, { message: text, idempotencyKey: key, turnPolicy: "queue" });
      result({ step: `reported:${key}`, status: sent.status, deliveryId: sent.body.deliveryId ?? null, at: Date.now() });
    });
    await waitForLine("done");
  } else if (scenario === "switch-during-turn") {
    const turnId = await until(first.client, state().sessionId, events => events.find(event => event.type === "turn.started")?.data.turnId);
    result({ step: "working", turnId, sessionId: state().sessionId });
    await waitForLine("cancel");
    // As select sends it: no turnId, so Eve cancels whatever runs
    const began = Date.now();
    await first.client.sessions.attach(state().sessionId).cancel({ signal: turn() });
    const settled = await until(first.client, state().sessionId, events => settledTurn(events), 10_000);
    result({ step: "cancelled", outcome: settled.data.outcome, ms: Date.now() - began });
    await runtime.close();
    runtime = undefined;
    result({ step: "closed", processes: caseProcesses() });
    const second = await start({});
    runtime = second.runtime;
    latest.client = second.client;
    await sleep(3_000);
    result({ step: "restarted" });
  } else if (scenario === "interrupted-after-kill" || scenario === "settle-hook-lost") {
    // The case kills this process group: during the turn, or once the settle hook's call is in flight
    const turnId = await until(first.client, state().sessionId, events => events.find(event => event.type === "turn.started")?.data.turnId);
    result({ step: "working", turnId, sessionId: state().sessionId });
    await new Promise(() => {});
  } else if (scenario === "rerun-no-duplicate") {
    // Stop the host as soon as dojo_context's call starts, then start it again: Eve reruns the step
    await until(first.client, state().sessionId, events => events.some(event => event.type === "call.started"));
    await runtime.close();
    runtime = undefined;
    const second = await start({});
    runtime = second.runtime;
    // Eve reruns an interrupted step only when its call's start was not saved; a turn it leaves open is reported as "open"
    const settled = await until(second.client, state().sessionId, events => settledTurn(events), 30_000).catch(() => undefined);
    const { events } = await second.client.sessions.attach(state().sessionId).snapshot({ signal: turn() });
    const reply = events.filter(event => event.type === "content.completed" && event.data.phase === "reply").map(event => event.data.value).join("");
    result({ step: "rerun", outcome: settled?.data.outcome ?? "open", reply, sessionId: state().sessionId });
  }
  await runtime?.close();
  runtime = undefined;
  process.exit(0);
} catch (error) {
  console.log(`CONFORMANCE_ERROR ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  // What the host's session recorded up to the failure, from the host that was running then
  const sessionId = latest?.state?.()?.sessionId;
  if (runtime && sessionId) {
    const { events } = await latest.client.sessions.attach(sessionId).snapshot({ signal: AbortSignal.timeout(10_000) }).catch(reason => ({ events: [{ type: "snapshot failed", data: String(reason) }] }));
    console.log(`CONFORMANCE_EVENTS ${JSON.stringify(events.map(event => [event.type, event.data?.outcome ?? event.data?.status ?? event.data?.kind ?? ""])).slice(0, 3000)}`);
  }
  await runtime?.close().catch(() => {});
  process.exit(1);
}
