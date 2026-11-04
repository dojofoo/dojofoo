// Host-level conformance driver, run as a child process by conformance.fixture.ts
// (docs/designs/agent-runtime.steps/step-3.md, "conformance-host.mjs"):
//   node scripts/conformance-host.mjs ask-answer-across-restart <agent> <root> [<model>]
// It starts Kyoshi's prepared host on exactly <agent>; the test process, where the loopback model runs, makes the assertions.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { agentRow, isAgentId } from "@dojofoo/protocol";

const [scenario, agent, root, model] = process.argv.slice(2);
if (!existsSync(new URL("../dist/eve/runtime.js", import.meta.url))) {
  console.error('Build authoring first: pnpm --filter "@dojofoo/authoring..." build');
  process.exit(2);
}
if (scenario !== "ask-answer-across-restart" || !isAgentId(agent) || !agentRow(agent).adapterId || !root) {
  console.error("usage: conformance-host.mjs ask-answer-across-restart <agent with an adapter> <root> [<model>]");
  process.exit(2);
}
const { createKyoshiRuntime } = await import("../dist/eve/runtime.js");
const { Client } = await import("@dojofoo/agent/client");
const result = value => console.log(`CONFORMANCE_RESULT ${JSON.stringify(value)}`);
const start = async options => {
  const runtime = await createKyoshiRuntime(root, { agent, ...options });
  const started = await runtime.start();
  const configuration = JSON.parse(await readFile(join(root, ".dojo/kyoshi-app/agents/kyoshi/runtime.json"), "utf8"));
  result({ step: "started", harness: configuration.harness });
  return { runtime, client: new Client({ baseUrl: started.url, auth: started.auth }) };
};
let runtime;
try {
  const first = await start(model ? { model } : {});
  runtime = first.runtime;
  const created = await first.client.sessions.create({ message: "Help me author a course.", signal: AbortSignal.timeout(120_000) });
  const parked = await created.delivery.result();
  result({ step: "parked", status: parked.status,
    interactions: parked.interactions.map(({ interactionId, request }) => ({ interactionId, prompt: request.prompt })),
    state: created.session.state });
  await runtime.close();
  runtime = undefined;
  const second = await start({});
  runtime = second.runtime;
  const state = created.session.state;
  const answered = await (await second.client.sessions.attach(state.sessionId, state).respond([{
    interactionId: parked.interactions[0]?.interactionId, optionId: "Beginner",
  }], { signal: AbortSignal.timeout(60_000) })).result();
  result({ step: "answered", status: answered.status, reply: answered.reply, sessionId: state.sessionId });
  await runtime.close();
  runtime = undefined;
  process.exit(0);
} catch (error) {
  console.log(`CONFORMANCE_ERROR ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  await runtime?.close().catch(() => {});
  process.exit(1);
}
