// Host-level conformance driver, run as a child process by conformance.fixture.ts
// (docs/designs/agent-runtime.steps/step-3.md and step-4.md, "conformance-host.mjs"):
//   node scripts/conformance-host.mjs <scenario> <agent> <root> [<model>] [--persona kyoshi|sensei] [--host-port <url>] [--workspace-id <id>]
// It starts the persona's prepared host on exactly <agent>; the test process, where the loopback model and the host-port fixture run,
// makes the assertions. A scenario that must hold its host open waits for a line on stdin.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { agentRow, isAgentId } from "@dojofoo/protocol";

const scenarios = {
  kyoshi: ["ask-answer-across-restart", "cancel-pending-host-tool", "resume-after-eviction", "crash-after-park", "restart-only"],
  sensei: ["ask-answer-across-restart", "cancel-pending-host-tool", "resume-after-eviction", "crash-after-park", "restart-only",
    "host-tool-turn", "model-switch", "rerun-no-duplicate"],
};
const argument = name => { const index = process.argv.indexOf(name); return index === -1 ? undefined : process.argv[index + 1]; };
const positional = process.argv.slice(2).filter((value, index, all) => !value.startsWith("--") && !all[index + 1 - 1 - 1]?.startsWith("--"));
const [scenario, agent, root, model] = positional;
const persona = argument("--persona") ?? "kyoshi";
const hostPortUrl = argument("--host-port");
const workspaceId = argument("--workspace-id");
if (!existsSync(new URL("../dist/eve/runtime.js", import.meta.url))) {
  console.error('Build authoring first: pnpm --filter "@dojofoo/authoring..." build');
  process.exit(2);
}
if (!scenarios[persona]?.includes(scenario) || !isAgentId(agent) || !agentRow(agent).adapterId || !root) {
  console.error("usage: conformance-host.mjs <scenario> <agent with an adapter> <root> [<model>] [--persona kyoshi|sensei] [--host-port <url>] [--workspace-id <id>]");
  process.exit(2);
}
const { createKyoshiRuntime } = await import("../dist/eve/runtime.js");
const { createSenseiRuntime } = await import("../dist/sensei/runtime.js");
const { Client } = await import("@dojofoo/agent/client");
const result = value => console.log(`CONFORMANCE_RESULT ${JSON.stringify(value)}`);
const app = persona === "kyoshi" ? ".dojo/kyoshi-app/agents/kyoshi" : ".dojo/sensei-app/agents/sensei";
const start = async options => {
  const target = { agent, ...(workspaceId ? { workspaceId } : {}), ...(hostPortUrl ? { hostPortUrl } : {}), ...options };
  const runtime = persona === "kyoshi" ? await createKyoshiRuntime(root, target) : await createSenseiRuntime(root, target);
  const started = await runtime.start();
  const configuration = JSON.parse(await readFile(join(root, app, "runtime.json"), "utf8"));
  result({ step: "started", harness: configuration.harness, secret: started.secret });
  return { runtime, client: new Client({ baseUrl: started.url, auth: started.auth }) };
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
/** A Sensei conversation as the UI server opens it: a bodyless create, then its first message (so the channel knows the session) */
async function open(client, message) {
  if (persona === "kyoshi") return client.sessions.create({ message, signal: turn() });
  const { session } = await client.sessions.create({ signal: turn() });
  return { session, delivery: await session.send(message, { signal: turn() }) };
}
const firstPrompt = persona === "kyoshi" ? "Help me author a course." : "Introduce the lesson.";
const settledTurn = (events, outcome) => events.find(event => event.type === "turn.settled" && (!outcome || event.data.outcome === outcome));
let runtime;
try {
  const first = await start(model ? { model } : {});
  runtime = first.runtime;
  if (scenario === "restart-only") {
    await runtime.close();
    runtime = undefined;
    result({ step: "closed" });
    process.exit(0);
  }
  const created = await open(first.client, firstPrompt);
  const state = () => created.session.state;
  if (scenario === "ask-answer-across-restart" || scenario === "crash-after-park") {
    const parked = await created.delivery.result({ signal: turn() });
    result({ step: "parked", status: parked.status,
      interactions: parked.interactions.map(({ interactionId, request }) => ({ interactionId, prompt: request.prompt })), state: state() });
    if (scenario === "crash-after-park") await new Promise(() => {});   // the test kills this process group
    await runtime.close();
    runtime = undefined;
    const second = await start({});
    runtime = second.runtime;
    const session = second.client.sessions.attach(state().sessionId, state());
    // Kyoshi answers the question's option; Sensei's learner answers by typing in the composer, a plain message
    const delivery = persona === "kyoshi"
      ? await session.respond([{ interactionId: parked.interactions[0]?.interactionId, optionId: "Beginner" }], { signal: turn() })
      : await session.send("Beginner", { signal: turn() });
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
  await runtime?.close().catch(() => {});
  process.exit(1);
}
