import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "@ai-sdk/provider-utils";
import { HarnessAgent } from "@dojofoo/agent/harness";
import { createLocalSandbox, prepareHarnessEnvironment } from "@dojofoo/agent/experimental/local";
import { personaRecordedFrom, type Persona } from "@dojofoo/protocol";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  caseBaseEnvironment, expectNoNativeProcesses, nativeProcesses, observe, openCase, requestsCarrying, runKyoshiHost,
  seedMarkers, snapshotDirectory, stopAfterCancel, userConfigSeeds,
  type CaseContext, type LoopbackEndpoint, type TierAAgent, type ToolRequest,
} from "./conformance.fixture";
// @ts-expect-error The conformance scripts are plain JavaScript without declarations.
import { conformancePaths, installAgent, needsInstall, readRecord, tierAAgents } from "../../scripts/conformance-install.mjs";
import instructions from "./instructions";

// Tier A of docs/designs/agent-runtime.md, "Conformance tiers": every registry row with an adapter except Cursor,
// against the loopback model. The case list, its tags and its runner are docs/designs/agent-runtime.steps/step-3.md.
const implementedStep = 3;                                   // each later step raises it
interface ConformanceCase {
  id: string;                 // "<persona>.<level>.<name>", the record's key; never reused
  persona: Persona;
  since: 3 | 4 | 5 | 6 | 7 | 8;
  tier: "A" | "B";
  agents: "tier-a" | "scripted";   // "scripted": runs once on the scripted HarnessV1 fixture (guard cases)
  title: string;
  run?(context: CaseContext): Promise<void>;
}

const later = (since: ConformanceCase["since"], persona: Persona, id: string, title: string, options: Partial<ConformanceCase> = {}): ConformanceCase =>
  ({ id, persona, since, tier: "A", agents: "tier-a", title, ...options });

let harnessPath = "";
const turn = () => AbortSignal.timeout(90_000);
const echoRequest: ToolRequest = { name: "dojo_conformance_echo", input: { value: "receipt" } };
const waitRequest: ToolRequest = { name: "dojo_conformance_wait", input: { value: "hold" } };
const question = { question: "Which learner?", options: [
  { label: "Beginner", description: "New to the topic" },
  { label: "Experienced", description: "Already knows the basics" },
] };

/** A harness-level session, configured the way Kyoshi's model is (agent.ts:32-37): no tool filter, default permission mode. */
async function harnessSession(context: CaseContext, endpoint: LoopbackEndpoint, tools: ConstructorParameters<typeof HarnessAgent>[0]["tools"] = undefined) {
  const sandbox = await createLocalSandbox(context.root, { environment: context.environment(endpoint) });
  context.defer(() => sandbox.stop());
  const harness = context.wiring.adapter(endpoint, context.home);
  const agent = new HarnessAgent({ harness, ...(context.wiring.firstModel ? { model: context.wiring.firstModel } : {}),
    ...(tools ? { tools } : {}), sandboxConfig: { workDir: "course" } });
  const session = await agent.createSession({ sandboxSession: sandbox, abortSignal: AbortSignal.timeout(180_000) });
  return { sandbox, harness, agent, session };
}

/** "Introduce the lesson.", stop, resume from the JSON round-trip of the checkpoint, "Continue the lesson." */
async function resumedSession(context: CaseContext, endpoint: LoopbackEndpoint) {
  const { sandbox, harness, agent, session } = await harnessSession(context, endpoint);
  const first = await agent.generate({ session, prompt: "Introduce the lesson.", abortSignal: turn() });
  expect(first.text).toBe("Ready to teach.");
  const checkpoint = await session.stop();
  const resumed = await agent.createSession({ sandboxSession: sandbox, sessionId: session.sessionId,
    resumeFrom: JSON.parse(JSON.stringify(checkpoint)), abortSignal: AbortSignal.timeout(180_000) });
  const second = await agent.generate({ session: resumed, prompt: "Continue the lesson.", abortSignal: turn() });
  expect(second.text).toBe("Ready to teach.");
  expect(resumed.sessionId).toBe(session.sessionId);
  return { harness, agent, session: resumed, sessionId: session.sessionId };
}

const cases: ConformanceCase[] = [
  {
    id: "kyoshi.harness.resume-after-stop", persona: "kyoshi", since: 3, tier: "A", agents: "tier-a",
    title: "A stopped session resumes from its checkpoint with its history",
    async run(context) {
      const endpoint = await context.loopback();
      const { session } = await resumedSession(context, endpoint);
      const request = requestsCarrying(endpoint, "Continue the lesson.").at(-1);
      expect(request, JSON.stringify(endpoint.paths)).toBeDefined();
      expect(JSON.stringify(request!.request)).toContain("Introduce the lesson.");
      await session.stop();
    },
  },
  {
    id: "kyoshi.harness.model-switch", persona: "kyoshi", since: 3, tier: "A", agents: "tier-a",
    title: "A fresh HarnessAgent with the second model continues the resumed session",
    async run(context) {
      const endpoint = await context.loopback();
      const { harness, session, sessionId } = await resumedSession(context, endpoint);
      const before = requestsCarrying(endpoint, "Continue the lesson.").at(-1);
      expect(before).toBeDefined();
      if (context.wiring.firstWire) expect(before!.model).toMatch(context.wiring.firstWire);
      // As Eve's dynamic resolver does between turns; the existing session stays authoritative.
      const switched = new HarnessAgent({ harness, model: context.wiring.secondModel.selection, sandboxConfig: { workDir: "course" } });
      const reply = await switched.generate({ session, prompt: "Continue with the newly selected model.", abortSignal: turn() });
      expect(reply.text).toBe("Ready to teach.");
      const request = requestsCarrying(endpoint, "Continue with the newly selected model.").at(-1);
      expect(request, JSON.stringify(endpoint.paths)).toBeDefined();
      expect(request!.model).toMatch(context.wiring.secondModel.wire);
      expect(request!.model).not.toBe(before!.model);
      for (const prompt of ["Introduce the lesson.", "Continue the lesson.", "Continue with the newly selected model."]) {
        expect(JSON.stringify(request!.request)).toContain(prompt);
      }
      expect(session.sessionId).toBe(sessionId);
      await session.stop();
    },
  },
  {
    id: "kyoshi.harness.host-tool-turn", persona: "kyoshi", since: 3, tier: "A", agents: "tier-a",
    title: "A host tool runs once with the model's input and its result reaches the model",
    async run(context) {
      const endpoint = await context.loopback(echoRequest);
      const executions: unknown[] = [];
      const tools = { dojo_conformance_echo: tool({ description: "Echo a value back to the conformance case.",
        inputSchema: z.object({ value: z.string() }),
        execute: async (input: { value: string }) => { executions.push(input); return { echoed: input.value }; } }) };
      const { agent, session } = await harnessSession(context, endpoint, tools);
      const result = await agent.generate({ session, prompt: "Use the conformance tool.", abortSignal: turn() });
      expect(executions, JSON.stringify({ requestedTools: endpoint.requestedTools, paths: endpoint.paths })).toEqual([{ value: "receipt" }]);
      expect(endpoint.requests.some(request => JSON.stringify(request).includes("echoed"))).toBe(true);
      expect(result.text).toBe("Ready to teach.");
      await session.stop();
    },
  },
  {
    id: "kyoshi.harness.cancel-active-turn", persona: "kyoshi", since: 3, tier: "A", agents: "tier-a",
    title: "Aborting a turn while the model is answering ends it with the abort",
    async run(context) {
      const endpoint = await context.loopback();
      const { agent, session } = await harnessSession(context, endpoint);
      const held = endpoint.holdNextResponse(request => JSON.stringify(request).includes("Wait for the model before answering."));
      const cancellation = new AbortController();
      const reason = new Error("Cancelled by the author");
      const outcome = agent.generate({ session, prompt: "Wait for the model before answering.",
        abortSignal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(60_000)]) }).then(() => undefined, (error: unknown) => error);
      try {
        await Promise.race([held.started, outcome.then(() => { throw new Error("Turn finished before cancellation"); })]);
        // The positive control for the process count after the case.
        if (context.wiring.outOfProcess) expect((await nativeProcesses(context.markers)).length).toBeGreaterThan(0);
        cancellation.abort(reason);
        const failure = await outcome;
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).name).not.toBe("TimeoutError");
        expect((failure as Error).message).toMatch(/aborted|Cancelled by the author/i);
      } finally { held.release(); }
      await stopAfterCancel(session, reason);
    },
  },
  {
    id: "kyoshi.harness.cancel-pending-host-tool", persona: "kyoshi", since: 3, tier: "A", agents: "tier-a",
    title: "Aborting while a host tool is pending ends the turn and changes no course file",
    async run(context) {
      const endpoint = await context.loopback(waitRequest);
      let markStarted = () => {};
      const started = new Promise<void>(resolve => { markStarted = resolve; });
      const tools = { dojo_conformance_wait: tool({ description: "Wait until the conformance case cancels the turn.",
        inputSchema: z.object({ value: z.string() }),
        // Settles only on its abort signal.
        execute: (_input: { value: string }, { abortSignal }: { abortSignal?: AbortSignal }) => new Promise<{ waited: boolean }>((_resolve, reject) => {
          markStarted();
          abortSignal?.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
        }) }) };
      const { agent, session } = await harnessSession(context, endpoint, tools);
      const before = await snapshotDirectory(context.course);
      const cancellation = new AbortController();
      const reason = new Error("Cancelled by the author");
      const outcome = agent.generate({ session, prompt: "Wait for the host tool.",
        abortSignal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(60_000)]) }).then(() => undefined, (error: unknown) => error);
      await Promise.race([started, outcome.then(() => { throw new Error("Turn finished before the host tool started"); })]);
      cancellation.abort(reason);
      const failure = await outcome;
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).name).not.toBe("TimeoutError");
      expect((failure as Error).message).toMatch(/aborted|Cancelled by the author/i);
      await stopAfterCancel(session, reason);
      const requests = endpoint.requests.length;
      await new Promise(resolve => setTimeout(resolve, 2000));
      expect(endpoint.requests.length, "no model request after the stop").toBe(requests);
      expect(await snapshotDirectory(context.course)).toEqual(before);
    },
  },
  {
    id: "kyoshi.harness.compaction", persona: "kyoshi", since: 3, tier: "A", agents: "tier-a",
    title: "Native compaction resolves and keeps the session, or is reported unsupported",
    async run(context) {
      const endpoint = await context.loopback();
      // Pi keeps the most recent 20,000 tokens out of a summary, so a fixture conversation has nothing to compact.
      if (context.agent === "pi") await writeFile(join(context.home, ".pi/agent/settings.json"), JSON.stringify({ compaction: { keepRecentTokens: 1 } }));
      const { agent, session } = await harnessSession(context, endpoint);
      const { sessionId } = session;
      expect((await agent.generate({ session, prompt: "Introduce the lesson.", abortSignal: turn() })).text).toBe("Ready to teach.");
      const expected = context.wiring.compaction;
      if (expected === "unsupported") {
        await expect(session.compact()).rejects.toMatchObject({ name: "AI_HarnessCapabilityUnsupportedError" });
      } else {
        const before = endpoint.requests.length;
        if (context.agent === "opencode") {
          await expect(session.compact("Custom summary instructions")).rejects.toMatchObject({
            name: "AI_HarnessCapabilityUnsupportedError", message: expect.stringContaining("does not expose custom compaction instructions"),
          });
          await session.compact();
        } else if (context.agent === "pi") await session.compact("Custom summary instructions");
        else await session.compact();
        // Claude Code's /compact resolves without a model request (claude-spike.md).
        if (expected === "native") expect(endpoint.requests.length).toBeGreaterThan(before);
        const continued = await agent.generate({ session, prompt: "Continue after native compaction.", abortSignal: turn() });
        expect(continued.text).toBe("Ready to teach.");
        expect(session.sessionId).toBe(sessionId);
        expect(requestsCarrying(endpoint, "Continue after native compaction.").length).toBeGreaterThan(0);
      }
      await session.stop();
    },
  },
  {
    id: "kyoshi.harness.user-config-seed", persona: "kyoshi", since: 3, tier: "A", agents: "tier-a",
    title: "A turn with the user's config seeded answers; which seeds reached the model is recorded",
    async run(context) {
      const endpoint = await context.loopback();
      await userConfigSeeds(context.agent, context.root, context.home);
      const { agent, session } = await harnessSession(context, endpoint);
      expect((await agent.generate({ session, prompt: "Introduce the lesson.", abortSignal: turn() })).text).toBe("Ready to teach.");
      await session.stop();
      const requests = JSON.stringify(endpoint.requests);
      const log = join(context.root, "seeded-mcp.log");
      await observe(context.agent, "userConfig.kyoshi", {
        mcp: existsSync(log) && (await readFile(log, "utf8")).includes("initialize"),
        skill: requests.includes(seedMarkers.skill),
        rules: requests.includes(seedMarkers.rules),
      });
    },
  },
  {
    id: "kyoshi.host.ask-answer-across-restart", persona: "kyoshi", since: 3, tier: "A", agents: "tier-a",
    title: "Kyoshi's host parks a question, restarts and continues with the answer",
    async run(context) {
      const endpoint = await context.loopback({ name: "dojo_ui_ask", input: question });
      const host = await runKyoshiHost(context, endpoint, harnessPath, context.wiring.hostModel);
      const diagnostics = JSON.stringify({ exitCode: host.exitCode, error: host.error, output: host.output.slice(-4000),
        requestedTools: endpoint.requestedTools, toolLists: endpoint.toolLists, paths: endpoint.paths });
      expect(host.error, diagnostics).toBeUndefined();
      expect(host.exitCode, diagnostics).toBe(0);
      const started = host.results.filter(result => result.step === "started");
      expect(started.map(result => result.harness), diagnostics).toEqual([context.agent, context.agent]);
      const parked = host.results.find(result => result.step === "parked") as { status: string; interactions: Array<{ prompt: string }> };
      expect(parked.interactions, diagnostics).toHaveLength(1);
      expect(parked.interactions[0]!.prompt).toBe("Which learner?");
      const answered = host.results.find(result => result.step === "answered") as { reply: string };
      expect(answered.reply, diagnostics).toBe("Ready to teach.");
      const requests = JSON.stringify(endpoint.requests);
      expect(requests).toContain(JSON.stringify(instructions.content).slice(1, -1));
      expect(requests).toContain("Help me author a course.");
      expect(requests).toContain("Beginner");
      expect(context.wiring.askedOnce(endpoint.requestedTools), diagnostics).toBe(true);
      expect((await readdir(context.root)).sort()).toEqual([".dojo", "home"]);
    },
  },
  later(4, "kyoshi", "kyoshi.host.cancel-pending-host-tool", "Cancelling with a host tool pending leaves no native process (lifecycle stop-and-evict)"),
  later(4, "kyoshi", "kyoshi.host.resume-after-eviction", "An evicted Kyoshi session resumes (evictHarnessSession)"),
  later(4, "kyoshi", "kyoshi.host.processes-after-host-crash", "A crashed and restarted host leaves no native process (the reaper)"),
  later(4, "kyoshi", "kyoshi.harness.native-write", "Kyoshi's native write tool changes a course file (control for Sensei's denials)"),
  later(4, "sensei", "sensei.interactive.host-tool-turn", "Interactive Sensei calls a host-port tool"),
  later(4, "sensei", "sensei.interactive.ask-answer-across-restart", "Interactive Sensei parks a question across a host restart"),
  later(4, "sensei", "sensei.interactive.cancel-pending-host-tool", "Interactive Sensei cancels with a host tool pending"),
  later(4, "sensei", "sensei.interactive.resume-after-eviction", "Interactive Sensei resumes after eviction"),
  later(4, "sensei", "sensei.interactive.model-switch", "Interactive Sensei switches model per session (D7)"),
  later(4, "sensei", "sensei.read-only.tool-list", "Every offered tool list is within the read-only built-ins plus Eve's tools"),
  later(4, "sensei", "sensei.read-only.adversarial-native-calls", "Native write, edit, create, delete and shell calls are denied with a typed record"),
  later(4, "sensei", "sensei.read-only.user-mcp-write", "A write-capable MCP server in the user's config cannot write (open risk 10)"),
  later(4, "sensei", "sensei.isolation.user-config", "No seeded user config reaches the model; the seeded MCP server never starts (D34)"),
  later(4, "sensei", "sensei.read-only.absolute-path-reads", "Absolute-path reads are recorded (open risk 13)"),
  later(4, "sensei", "sensei.resume-failure.one-replacement", "A failed resume is replaced exactly once (D28)"),
  later(4, "sensei", "sensei.host-port.rerun-no-duplicate", "A rerun host-port call does not duplicate its effect"),
  later(4, "sensei", "sensei.acp.rerun-after-model-change", "An ACP agent reruns after a model change"),
  later(5, "sensei", "sensei.kata.host-tool-turn", "Kata Sensei calls Check through the host port"),
  later(5, "sensei", "sensei.kata.ask-answer-across-restart", "Kata Sensei parks a question across a host restart"),
  later(5, "sensei", "sensei.kata.cancel-pending-host-tool", "Kata Sensei cancels with a host tool pending"),
  later(5, "sensei", "sensei.kata.resume-after-eviction", "Kata Sensei resumes after eviction"),
  later(5, "sensei", "sensei.guard.write-restored", "The guard restores a native write", { agents: "scripted" }),
  later(5, "sensei", "sensei.guard.delete-restored", "The guard restores a native delete", { agents: "scripted" }),
  later(5, "sensei", "sensei.guard.create-restored", "The guard removes a native create", { agents: "scripted" }),
  later(5, "sensei", "sensei.guard.write-after-pause", "A write after the pause is not restored, and is recorded (accepted residual)", { agents: "scripted" }),
  later(5, "sensei", "sensei.guard.host-port-down-at-pause", "The guard handles a host port that is down at the pause", { agents: "scripted" }),
  later(5, "sensei", "sensei.check.during-working-turn", "Check during a working turn, then settle (open risk 4)"),
  later(5, "sensei", "sensei.switch.timeout-marks-interrupted", "An agent switch that times out marks the turn interrupted"),
  later(5, "sensei", "sensei.switch.during-working-turn", "An agent switch during a working turn"),
  later(5, "sensei", "sensei.host.start-after-eve-version-change", "A host start after an Eve version change closes a working session's window"),
  later(6, "kyoshi", "kyoshi.switch.away-and-back", "Switching away and back continues the old Kyoshi conversation (D31)"),
  later(6, "sensei", "sensei.switch.away-and-back", "Switching away and back continues the old Sensei conversation (D31)"),
  later(6, "kyoshi", "kyoshi.switch.new-agent-new-session", "After an agent switch the page opens a new Kyoshi session (D29)"),
  later(6, "sensei", "sensei.switch.new-agent-new-session", "After an agent switch the page opens a new Sensei session (D29)"),
  later(7, "sensei", "sensei.evaluation.trial-loopback", "An evaluation trial runs against the loopback model"),
  later(8, "sensei", "sensei.tier-b.latency", "Median time to first output is at most 15 s", { tier: "B" }),
  later(8, "sensei", "sensei.tier-b.leave-cancels-begin-turns", "Leaving N lessons cancels their begin turns", { tier: "B" }),
  later(8, "sensei", "sensei.tier-b.two-hosts-one-agent", "Two hosts on one agent (open risk 6)", { tier: "B" }),
  later(8, "sensei", "sensei.tier-b.host-memory", "Host memory", { tier: "B" }),
  later(8, "kyoshi", "kyoshi.tier-b.cold-start", "Kyoshi cold start", { tier: "B" }),
];

// A step cannot raise implementedStep and leave a case behind; this throws at collection, in every run.
for (const entry of cases) {
  if (entry.since <= implementedStep && !entry.run) throw new Error(`${entry.id} is due in step ${entry.since} but has no body`);
  if (entry.since <= implementedStep && entry.agents === "scripted") throw new Error(`${entry.id} is a scripted case; step ${entry.since} adds their runner`);
}
const allAgents: TierAAgent[] = tierAAgents({});
const agents: TierAAgent[] = tierAAgents();   // narrowed by DOJO_CONFORMANCE_AGENTS
const due = cases.filter(entry => entry.since <= implementedStep && entry.tier === "A");
const title = (entry: ConformanceCase) => `${entry.id} [${entry.persona}, step ${entry.since}]`;

describe.skipIf(process.env.DOJO_HARNESS_LIFECYCLE !== "1")("tier A", () => {
  beforeAll(async () => {
    const { out } = conformancePaths();
    await mkdir(out, { recursive: true });
    // Every tier-A agent, whichever subset this process runs; each per-agent process writes the same file.
    await writeFile(join(out, "cases.json"), `${JSON.stringify({ implementedStep, personaRecordedFrom, agents: allAgents,
      cases: cases.map(({ id, persona, since, tier, agents: runsOn }) => ({ id, persona, since, tier, agents: runsOn })) }, null, 2)}\n`);
    // The only prepareHarnessEnvironment call here: mise installs pnpm once per run into the shared mise directories.
    harnessPath = (await prepareHarnessEnvironment(caseBaseEnvironment())).PATH!;
    // The design's direct command works without conformance:install; the install script records nothing here.
    for (const agent of agents) if (await needsInstall(agent)) await installAgent(agent, await readRecord());
  }, 600_000);

  for (const agent of agents) {
    describe(agent, () => {
      for (const entry of due) {
        it(title(entry), async () => {
          const context = await openCase(agent, entry.id, harnessPath, { course: !entry.id.includes(".host.") });
          try { await entry.run!(context); }
          finally { await context.close(); }
          await expectNoNativeProcesses(context.markers);
        }, 240_000);
      }
    });
  }
  describe("due in a later step", () => {
    for (const entry of cases.filter(item => item.since > implementedStep)) it.todo(title(entry));
  });
});
