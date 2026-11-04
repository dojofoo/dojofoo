import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "@ai-sdk/provider-utils";
import { HarnessAgent, createLocalHarnessSandbox, createLocalSandbox, prepareHarnessEnvironment, ResumeFailedError } from "@dojofoo/harness/adapters";
import { startHostPortFixture } from "@dojofoo/harness/host-port/fixture";
import { createFileGuard, type GuardVerdict, lifecycleHandlers, readOnlyToolNames } from "@dojofoo/harness/persona";
import type { ResumeFailure } from "@dojofoo/protocol";
import { personaRecordedFrom, type Persona } from "@dojofoo/protocol";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  agentProcesses, awayHome, caseBaseEnvironment, expectNoNativeProcesses, nativeCalls, nativeLogTail, nativeProcesses, observe, openCase, requestsCarrying, runHost, runKyoshiHost,
  runScriptedModel, runSenseiModel, scriptedCalls, seedMarkers, snapshotDirectory, stopAfterCancel, toolListExtras, userConfigSeeds, wiring,
  type CaseContext, type LoopbackEndpoint, type TierAAgent, type ToolRequest,
} from "./conformance.fixture";
import { acpModels } from "./models";
import { criterionIds, parseVerdict } from "../evaluation/judges";
import { parseGeneratedFixture } from "../evaluation/learner-fixtures";
import { evaluationPrompts } from "../evaluation/prompts";
// @ts-expect-error The conformance scripts are plain JavaScript without declarations.
import { agentHome, bootstrapBinary, conformancePaths, installAgent, needsInstall, pinnedCli, readRecord, tierAAgents } from "../../scripts/conformance-install.mjs";
import instructions from "./instructions";

// Tier A of docs/designs/agent-runtime.md, "Conformance tiers": every registry row with an adapter except Cursor,
// against the loopback model. The case list, its tags and its runner are docs/designs/agent-runtime.steps/step-3.md.
const implementedStep = 7;                                   // each later step raises it
interface ConformanceCase {
  id: string;                 // "<persona>.<level>.<name>", the record's key; never reused
  persona: Persona;
  since: 3 | 4 | 5 | 6 | 7 | 8;
  tier: "A" | "B";
  /** "scripted": runs once on the scripted HarnessV1 fixture (guard cases); a list: only those tier-A agents (step-4 plan, decision 16) */
  agents: "tier-a" | "scripted" | readonly TierAAgent[];
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

/** The turn's own main-loop request (it offers tools), not an agent's side request with the same prompt (OpenCode's title) */
const holdsTurn = (request: unknown) => {
  const tools = (request as { tools?: unknown } | null)?.tools;
  return Array.isArray(tools) && tools.length > 0 && JSON.stringify(request).includes("Introduce the lesson.");
};

/** Whether a model request offers the host tool: by name, or through the agent's own tool discovery (Grok finds host tools with
 *  `search_tool` and calls them with `use_tool`, so its list never names them; decision 68) */
const offers = (endpoint: LoopbackEndpoint, index: number, tool: string) =>
  (endpoint.toolLists[index] ?? []).some(name => name.endsWith(tool) || name === "search_tool");

/** A kata session's material, as the UI server answers `context` (step-5 plan, "Tier-A fixture answers") */
const kataContext = { kind: "kata", hash: "fixture", course: { id: "kata-course", title: "Kata course" }, guidance: "SENSEI-GUIDANCE-MARKER",
  lesson: { id: "first", source: "# First\n\n## Briefing\nKATA-SOURCE-MARKER\n", fragmentIds: ["hint"] },
  context: { phase: "start", course: { id: "kata-course", completedLessons: [] }, lesson: { id: "first", title: "First", objective: "KATA-OBJECTIVE-MARKER", state: "ongoing" },
    learner: { file: { path: "first.ts", language: "typescript", content: "export const answer = 0; // KATA-FILE-MARKER\n" }, latestCheck: null } } };
const kataCheck = { observationId: "fixture-check", report: { passed: 0, failed: 1, skipped: 0, total: 1, complete: false,
  tests: [{ name: "KATA-REPORT-MARKER", suite: [], status: "failed", failureMessages: ["expected 42"] }] } };

/** The host-port fixture a Sensei or Kyoshi host reports to; Sensei's session and course come from it. Its tool-call reads
 *  (keys `<session>:<callId>`) run once per key, as the UI server's idempotency keeps a mutating call's result. A kata fixture
 *  (`mode: "katas"`) answers the kata context, `check`, `turn.check` (409 for a turn the case marked interrupted) and `navigate`. */
async function hostPort(context: CaseContext, options: { model?: () => string | undefined; context?: (key: string) => Promise<void> | void;
  mode?: "katas" | "interactive"; check?: (key: string) => Promise<void> | void; interrupted?: Set<string>;
  handlers?: Record<string, (input: any, call: any) => unknown>; onAnswered?: (call: any) => void } = {}) {
  const kata = options.mode === "katas";
  const executions = new Map<string, number>();
  const memo = new Map<string, Promise<unknown>>();
  const once = (key: string, run: () => Promise<unknown>) => {
    if (!memo.has(key)) {
      executions.set(key, (executions.get(key) ?? 0) + 1);
      memo.set(key, run());
    }
    return memo.get(key);
  };
  const port = await startHostPortFixture({ onAnswered: options.onAnswered, handlers: {
    session: () => ({ courseId: kata ? "kata-course" : "first", ...(kata ? { lessonId: "first" } : {}), mode: kata ? "katas" : "interactive", revision: 0,
      ...(options.model?.() ?? context.wiring.hostModel ?? context.wiring.firstModel
      ? { model: options.model?.() ?? context.wiring.hostModel ?? context.wiring.firstModel } : {}) }),
    context: (_input, call) => {
      const body = kata ? kataContext : { kind: "interactive", hash: "fixture", course: { id: "first", title: "First" }, guidance: "SENSEI-GUIDANCE-MARKER",
        lesson: { title: "Lesson", marker: "ONMESSAGE-CONTEXT-MARKER" } };
      if (!call.idempotencyKey.includes(":")) return body;
      // A tool call: its own marker, and one run per key
      return once(call.idempotencyKey, () => Promise.resolve(options.context?.(call.idempotencyKey)).then(() => ({ ...body, toolMarker: "TOOL-CONTEXT-MARKER" })));
    },
    ...(kata ? {
      check: (_input: unknown, call: { idempotencyKey: string }) => once(call.idempotencyKey, () => Promise.resolve(options.check?.(call.idempotencyKey)).then(() => kataCheck)),
      "turn.check": (input: { turnId?: string }) => {
        if (input?.turnId && options.interrupted?.has(input.turnId)) throw Object.assign(new Error("This turn was interrupted by an agent switch."), { status: 409, code: "turn_interrupted" });
        return { ok: true };
      },
      navigate: () => ({ courseId: "kata-course", lessonId: "second" }),
    } : {}),
    ...options.handlers,
  } });
  context.defer(() => port.close());
  return { ...port, executions, recorded: (method: string) => port.calls.filter(call => call.method === method) };
}

/** A scripted guard case's window on `<case root>/course/solution.ts` (or a missing `created.ts`), a guard store under the case root, and the
 *  lifecycle hook's handlers bound to a host-port fixture whose pause and settle verify that window (or to a closed port: `portDown`) */
async function scriptedGuard(context: CaseContext, options: { create?: boolean; portDown?: boolean } = {}) {
  const file = join(context.course, options.create ? "created.ts" : "solution.ts");
  if (!options.create) await writeFile(file, "export const answer = 0;\n");
  const guard = createFileGuard(join(context.root, "guard"));
  const sessionId = `eve-scripted-${context.id}`;
  const window = await guard.open(sessionId, file);
  const verdicts: GuardVerdict[] = [];
  const verify = async () => {
    const verdict = await guard.verify(window.id);
    if (verdict) verdicts.push(verdict);
    return { ok: true };
  };
  const port = await startHostPortFixture({ handlers: { "turn.paused": verify, "turn.settled": verify } });
  context.defer(() => port.close());
  const handlers = lifecycleHandlers(async () => ({ url: options.portDown ? "http://127.0.0.1:9/api/host-port" : port.url, workspaceId: "w-scripted", persona: "sensei", secret: "scripted" }));
  const ctx = { session: { id: sessionId } };
  const report = (parked: boolean) => parked
    ? handlers["turn.paused"]({ data: { turnId: "turn_0", awaiting: [{ interactionId: "question" }] } }, ctx)
    : handlers["turn.settled"]({ data: { turnId: "turn_0", outcome: "completed" } }, ctx);
  return { file, guard, window, verdicts, report, quarantine: join(context.root, "guard", "quarantine") };
}

/** Pseudo-tools that run nothing: OpenCode reports a call to a tool it doesn't have through "invalid"; Grok's ACP adapter reports
 *  the files a tool call touched or tried to touch as "fileChange" (the snapshot check shows what actually changed) */
const refusalTools: Partial<Record<TierAAgent, string[]>> = { opencode: ["invalid"], grok: ["fileChange"] };

/** A host scenario's diagnostics for its assertions */
const diagnosticsOf = (endpoint: LoopbackEndpoint, output = "") => JSON.stringify({ output: output.slice(-4000), requestedTools: endpoint.requestedTools,
  toolLists: endpoint.toolLists, paths: endpoint.paths });

/** Waits for the agent's native processes to go while the host still runs (the lifecycle hook evicted them) */
async function expectEvicted(context: CaseContext) {
  let left = await agentProcesses(context.markers);
  for (const deadline = Date.now() + 10_000; left.length && Date.now() < deadline; left = await agentProcesses(context.markers)) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  expect(left, "native processes left after the cancel").toEqual([]);
}

/** The agent a step-6 case switches away to: Codex, or OpenCode when the case runs on Codex (decision 8) */
const awayAgent = (agent: TierAAgent): TierAAgent => agent === "codex" ? "opencode" : "codex";

/** Step 6 (D29, D31): three driver processes on one case root, so one Eve World: a turn on the case's agent A, a host on the away agent P in
 *  its own home that is never sent a message, then a turn on A again, on the first session (`away-and-back`) or on a new one */
async function switchAwayAndBack(context: CaseContext, persona: Persona, back: "same-session" | "new-session") {
  const endpoint = await context.loopback();
  const port = await hostPort(context);
  const onAgent = (scenario: string, args: string[]) => runHost(context, endpoint, harnessPath, { scenario, persona, hostPort: port.url, model: context.wiring.hostModel, args });
  const marker = back === "same-session" ? "AWAY-BACK-MARKER" : "OLD-SESSION-MARKER";
  const first = await onAgent("turn-on-session", ["--prompt", `${persona === "kyoshi" ? "Help me author a course." : "Introduce the lesson."} ${marker}`]).done;
  expect(first.error, diagnosticsOf(endpoint, first.output)).toBeUndefined();
  const before = first.results.find(entry => entry.step === "turned") as { sessionId: string; turnId: string; reply: string };
  expect(before?.reply, diagnosticsOf(endpoint, first.output)).toMatch(/Ready to teach\.$/u);
  // The agent switched to: its host starts on the same root, and nothing reaches the loopback while it runs
  const away = awayAgent(context.agent);
  const home = await awayHome(context, away, endpoint);
  const awayHost = runHost(context, endpoint, harnessPath, { scenario: "away", persona, hostPort: port.url, model: wiring[away].hostModel, agent: away, home });
  await awayHost.step("away-started");
  const requests = endpoint.requests.length;
  await new Promise(resolve => setTimeout(resolve, 2_000));
  expect(endpoint.requests.length, "no model request while the away agent's host runs").toBe(requests);
  awayHost.send("away-checked");
  const awayEnded = await awayHost.done;
  expect(awayEnded.error, awayEnded.output.slice(-3000)).toBeUndefined();
  expect((awayEnded.results.find(entry => entry.step === "closed") as { processes: string[] })?.processes).toEqual([]);
  const from = endpoint.requests.length;
  const again = await onAgent("turn-on-session", back === "same-session"
    ? ["--session", before.sessionId, "--prompt", "Continue the lesson."] : ["--inspect", before.sessionId]).done;
  const diagnostics = diagnosticsOf(endpoint, again.output);
  expect(again.error, diagnostics).toBeUndefined();
  const after = again.results.find(entry => entry.step === "turned") as { sessionId: string; turnId: string; reply: string };
  expect(after?.reply, diagnostics).toMatch(/Ready to teach\.$/u);
  if (back === "same-session") {
    // The old conversation continues on its own session with a new turn; whether the native agent resent its history after the cold
    // restart is the adapter's recovery, observed as after a host restart (decision 25)
    expect(after.sessionId).toBe(before.sessionId);
    expect(after.turnId).not.toBe(before.turnId);
    const request = requestsCarrying(endpoint, "Continue the lesson.").at(-1);
    expect(request, diagnostics).toBeDefined();
    await observe(context.agent, `historyAfterSwitchBack.${persona}`, JSON.stringify(request!.request).includes(marker));
  } else {
    // A new session on the agent inherits nothing from the old one, which keeps exactly its one settled turn (decision 27)
    expect(after.sessionId).not.toBe(before.sessionId);
    expect(endpoint.requests.slice(from).filter(request => JSON.stringify(request).includes(marker)), diagnostics).toEqual([]);
    expect((again.results.find(entry => entry.step === "inspected") as { settled: string[] })?.settled).toEqual([before.turnId]);
  }
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
      // The driver's output carries the session's events at a failure and what the first host left running
      const diagnostics = JSON.stringify({ exitCode: host.exitCode, error: host.error, output: host.output.slice(-6000),
        requestedTools: endpoint.requestedTools, toolLists: endpoint.toolLists, paths: endpoint.paths, nativeLogs: await nativeLogTail(context) });
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
  {
    id: "kyoshi.host.cancel-pending-host-tool", persona: "kyoshi", since: 4, tier: "A", agents: "tier-a",
    title: "Cancelling with a host tool pending leaves no native process (lifecycle stop-and-evict)",
    async run(context) {
      const endpoint = await context.loopback({ name: "dojo_ui_ask", input: question });
      const port = await hostPort(context);
      const host = runHost(context, endpoint, harnessPath, { scenario: "cancel-pending-host-tool", persona: "kyoshi", hostPort: port.url, model: context.wiring.hostModel });
      const cancelled = await host.step("cancelled");
      await expect.poll(() => port.recorded("turn.settled").map(call => (call.input as { outcome?: string }).outcome), { timeout: 15_000 }).toContain("cancelled");
      expect(port.recorded("turn.settled").find(call => (call.input as { outcome?: string }).outcome === "cancelled")?.idempotencyKey)
        .toBe(`${cancelled.sessionId}:${cancelled.turnId}:settled`);
      await expectEvicted(context);
      host.send("done");
      const ended = await host.done;
      expect(ended.exitCode, ended.output.slice(-3000)).toBe(0);
    },
  },
  {
    id: "kyoshi.host.resume-after-eviction", persona: "kyoshi", since: 4, tier: "A", agents: "tier-a",
    title: "An evicted Kyoshi session resumes (evictHarnessSession)",
    async run(context) {
      const endpoint = await context.loopback({ name: "dojo_ui_ask", input: question });
      const port = await hostPort(context);
      const host = runHost(context, endpoint, harnessPath, { scenario: "resume-after-eviction", persona: "kyoshi", hostPort: port.url, model: context.wiring.hostModel });
      await host.step("cancelled");
      await expectEvicted(context);
      host.send("continue");
      const continued = await host.step("continued");
      // The resumed native turn may first close the cancelled call with a reply of its own
      expect(continued.reply, diagnosticsOf(endpoint)).toMatch(/Ready to teach\.$/u);
      const request = requestsCarrying(endpoint, "Continue the lesson.").at(-1);
      expect(request, diagnosticsOf(endpoint)).toBeDefined();
      expect(JSON.stringify(request!.request)).toContain("Help me author a course.");
      host.send("done");
      expect((await host.done).exitCode).toBe(0);
    },
  },
  {
    id: "kyoshi.host.processes-after-host-crash", persona: "kyoshi", since: 4, tier: "A", agents: "tier-a",
    title: "A crashed and restarted host leaves no native process (the reaper)",
    async run(context) {
      const endpoint = await context.loopback({ name: "dojo_ui_ask", input: question });
      const host = runHost(context, endpoint, harnessPath, { scenario: "crash-after-park", persona: "kyoshi", model: context.wiring.hostModel });
      await host.step("parked");
      host.kill();
      await host.done;
      // Out-of-process agents run their native groups detached: they outlive the crashed host
      if (context.wiring.outOfProcess) expect((await agentProcesses(context.markers)).length, diagnosticsOf(endpoint)).toBeGreaterThan(0);
      const restart = await runHost(context, endpoint, harnessPath, { scenario: "restart-only", persona: "kyoshi", model: context.wiring.hostModel }).done;
      expect(restart.exitCode, restart.output.slice(-3000)).toBe(0);
      expect(await agentProcesses(context.markers)).toEqual([]);
    },
  },
  {
    id: "kyoshi.harness.native-write", persona: "kyoshi", since: 4, tier: "A", agents: "tier-a",
    title: "Kyoshi's native write tool changes a course file (control for Sensei's denials)",
    async run(context) {
      const target = join(context.course, "native.md");
      const endpoint = await context.loopback(undefined, scriptedCalls([nativeCalls[context.agent].write(target, "native write")]));
      const { agent, session } = await harnessSession(context, endpoint);
      const result = await agent.generate({ session, prompt: "Write the native file.", abortSignal: turn() });
      expect(result.text, diagnosticsOf(endpoint)).toBe("Ready to teach.");
      await session.stop();
      expect(existsSync(target), JSON.stringify(result.steps.flatMap(step => step.content).filter(part => String(part.type).startsWith("tool"))) + diagnosticsOf(endpoint)).toBe(true);
      expect(await readFile(target, "utf8")).toBe("native write");
    },
  },
  {
    id: "sensei.interactive.host-tool-turn", persona: "sensei", since: 4, tier: "A", agents: "tier-a",
    title: "Interactive Sensei calls a host-port tool",
    async run(context) {
      const endpoint = await context.loopback({ name: "dojo_context", input: {} });
      const port = await hostPort(context);
      const host = runHost(context, endpoint, harnessPath, { scenario: "host-tool-turn", persona: "sensei", hostPort: port.url });
      const ended = await host.done;
      const diagnostics = diagnosticsOf(endpoint, ended.output);
      expect(ended.error, diagnostics).toBeUndefined();
      const replied = ended.results.find(entry => entry.step === "replied") as { reply: string; sessionId: string };
      expect(replied?.reply, diagnostics).toBe("Ready to teach.");
      const tool = port.recorded("context").filter(call => call.idempotencyKey.includes(":"));
      expect(tool, diagnostics).toHaveLength(1);
      expect(tool[0]!.idempotencyKey.startsWith(`${replied.sessionId}:`)).toBe(true);
      expect(requestsCarrying(endpoint, "TOOL-CONTEXT-MARKER").length, diagnostics).toBeGreaterThan(0);
      const firstMain = endpoint.requests.find((_request, index) => endpoint.toolLists[index]?.length);
      expect(JSON.stringify(firstMain).split("ONMESSAGE-CONTEXT-MARKER").length - 1, diagnostics).toBe(1);
    },
  },
  {
    id: "sensei.interactive.ask-answer-across-restart", persona: "sensei", since: 4, tier: "A", agents: "tier-a",
    title: "Interactive Sensei parks a question across a host restart",
    async run(context) {
      const endpoint = await context.loopback({ name: "ask_question", input: { question: "Which learner?" } });
      const port = await hostPort(context);
      const ended = await runHost(context, endpoint, harnessPath, { scenario: "ask-answer-across-restart", persona: "sensei", hostPort: port.url }).done;
      const diagnostics = diagnosticsOf(endpoint, ended.output);
      expect(ended.error, diagnostics).toBeUndefined();
      const started = ended.results.filter(entry => entry.step === "started");
      expect(started).toHaveLength(2);
      expect(started[0]!.secret).not.toBe(started[1]!.secret);
      // The host restarted with a new secret: the fixture saw both bearers
      expect(new Set(port.calls.map(call => call.bearer))).toEqual(new Set([started[0]!.secret, started[1]!.secret]));
      const parked = ended.results.find(entry => entry.step === "parked") as { interactions: Array<{ prompt: string }> };
      expect(parked.interactions[0]?.prompt, diagnostics).toBe("Which learner?");
      expect(port.recorded("turn.paused").length).toBeGreaterThan(0);
      const answered = ended.results.find(entry => entry.step === "answered") as { reply: string };
      expect(answered?.reply, diagnostics).toBe("Ready to teach.");
      // Whether the native agent saw the answer after its restart is the adapter's recovery; recorded, not required
      await observe(context.agent, "senseiAnswerAfterRestart", JSON.stringify(endpoint.requests.slice(-2)).includes("Beginner"));
      expect(port.recorded("turn.settled").map(call => (call.input as { outcome?: string }).outcome)).toContain("completed");
    },
  },
  {
    id: "sensei.interactive.cancel-pending-host-tool", persona: "sensei", since: 4, tier: "A", agents: "tier-a",
    title: "Interactive Sensei cancels with a host tool pending",
    async run(context) {
      const endpoint = await context.loopback({ name: "dojo_context", input: {} });
      let releaseContext = () => {};
      const released = new Promise<void>(resolve => { releaseContext = resolve; });
      const release = { promise: released, resolve: () => releaseContext() };
      context.defer(() => release.resolve());
      const port = await hostPort(context, { context: () => release.promise });
      const host = runHost(context, endpoint, harnessPath, { scenario: "cancel-pending-host-tool", persona: "sensei", hostPort: port.url });
      await host.step("cancelled");
      await expect.poll(() => port.recorded("turn.settled").map(call => (call.input as { outcome?: string }).outcome), { timeout: 15_000 }).toContain("cancelled");
      await expectEvicted(context);
      const requests = endpoint.requests.length;
      release.resolve();
      await new Promise(resolve => setTimeout(resolve, 2000));
      expect(endpoint.requests.length, "no model request after the cancel").toBe(requests);
      host.send("done");
      expect((await host.done).exitCode).toBe(0);
    },
  },
  {
    id: "sensei.interactive.resume-after-eviction", persona: "sensei", since: 4, tier: "A", agents: "tier-a",
    title: "Interactive Sensei resumes after eviction",
    async run(context) {
      const endpoint = await context.loopback({ name: "dojo_context", input: {} });
      let releaseContext = () => {};
      const released = new Promise<void>(resolve => { releaseContext = resolve; });
      const release = { promise: released, resolve: () => releaseContext() };
      context.defer(() => release.resolve());
      const port = await hostPort(context, { context: () => release.promise });
      const host = runHost(context, endpoint, harnessPath, { scenario: "resume-after-eviction", persona: "sensei", hostPort: port.url });
      await host.step("cancelled");
      await expectEvicted(context);
      release.resolve();
      host.send("continue");
      const continued = await host.step("continued");
      expect(continued.reply, diagnosticsOf(endpoint)).toMatch(/Ready to teach\.$/u);
      const request = requestsCarrying(endpoint, "Continue the lesson.").at(-1);
      expect(request, diagnosticsOf(endpoint)).toBeDefined();
      expect(JSON.stringify(request!.request)).toContain("Introduce the lesson.");
      host.send("done");
      expect((await host.done).exitCode).toBe(0);
    },
  },
  {
    id: "sensei.interactive.model-switch", persona: "sensei", since: 4, tier: "A", agents: "tier-a",
    title: "Interactive Sensei switches model per session (D7)",
    async run(context) {
      const endpoint = await context.loopback();
      let switched = false;
      const port = await hostPort(context, { model: () => switched ? context.wiring.secondModel.selection : context.wiring.firstModel });
      const host = runHost(context, endpoint, harnessPath, { scenario: "model-switch", persona: "sensei", hostPort: port.url });
      const first = await host.step("first");
      expect(first.reply, diagnosticsOf(endpoint)).toBe("Ready to teach.");
      const before = requestsCarrying(endpoint, "Introduce the lesson.").at(-1);
      switched = true;
      host.send("switched");
      const second = await host.step("second");
      expect(second.reply, diagnosticsOf(endpoint)).toBe("Ready to teach.");
      expect(second.sessionId).toBe(first.sessionId);
      const request = requestsCarrying(endpoint, "Continue with the newly selected model.").at(-1);
      expect(request, diagnosticsOf(endpoint)).toBeDefined();
      expect(request!.model).toMatch(context.wiring.secondModel.wire);
      if (before) expect(request!.model).not.toBe(before.model);
      expect(JSON.stringify(request!.request)).toContain("Introduce the lesson.");
      expect((await host.done).exitCode).toBe(0);
    },
  },
  {
    id: "sensei.read-only.tool-list", persona: "sensei", since: 4, tier: "A", agents: "tier-a",
    title: "Every offered tool list is within the read-only built-ins plus Eve's tools",
    async run(context) {
      const endpoint = await context.loopback();
      const run = await runSenseiModel(context, endpoint, { prompt: "Introduce the lesson." });
      expect(run.failure, diagnosticsOf(endpoint)).toBeUndefined();
      expect(run.text).toBe("Ready to teach.");
      // Streams name built-ins by their HarnessV1 key or their native name; either is within the row
      const allowed = new Set([...run.native, ...run.keys, ...Object.keys(toolListExtras[context.agent])]);
      const outside = [...new Set(endpoint.toolLists.flat())].filter(name => !allowed.has(name));
      expect(outside, diagnosticsOf(endpoint)).toEqual([]);
    },
  },
  {
    id: "sensei.read-only.adversarial-native-calls", persona: "sensei", since: 4, tier: "A", agents: "tier-a",
    title: "Native write, edit, create, delete and shell calls are denied with a typed record",
    async run(context) {
      const calls = nativeCalls[context.agent];
      const lesson = join(context.course, "lesson.md");
      const sequence = [
        calls.write(lesson, "Overwritten by Sensei"),
        calls.edit(lesson, "Lesson", "Edited"),
        calls.write(join(context.course, "created.md"), "Created by Sensei"),
        calls.shell(`rm -f '${lesson}'`),
        calls.shell(`echo shell > '${join(context.course, "shell.md")}'`),
      ];
      const endpoint = await context.loopback(undefined, scriptedCalls(sequence));
      const before = await snapshotDirectory(context.course);
      const run = await runSenseiModel(context, endpoint, { prompt: "Introduce the lesson." });
      const diagnostics = JSON.stringify({ failure: String(run.failure), records: run.records, parts: run.parts.filter(part => String(part.type).startsWith("tool")), paths: endpoint.paths });
      expect(await snapshotDirectory(context.course), diagnostics).toEqual(before);
      expect(run.parts.some(part => part.type === "tool-approval-request"), diagnostics).toBe(false);
      // An agent's own refusal of an unknown tool (OpenCode's "invalid") ran nothing
      const refusal = refusalTools[context.agent] ?? [];
      expect(run.records.filter(record => record.kind === "native-call-outside-allow-list" && !record.failed && !refusal.includes(record.tool)), diagnostics).toEqual([]);
      for (const call of run.parts.filter(part => part.type === "tool-call" && part.providerExecuted)) {
        const name = String(call.toolName);
        if (run.native.includes(name) || run.keys.includes(name) || refusal.includes(name)) continue;
        const failed = run.parts.some(part => part.type === "tool-result" && part.toolCallId === call.toolCallId && part.isError);
        const refused = run.records.some(record => record.tool === name);
        expect(failed || refused, `${name}: ${diagnostics}`).toBe(true);
      }
      // Open risk 1 (Grok's allow-reads approvals): what the adapter did with each attempted call
      await observe(context.agent, "prevention.sensei", { records: run.records.map(record => ({ kind: record.kind, tool: record.tool })),
        failure: run.failure instanceof Error ? run.failure.name : undefined });
    },
  },
  {
    id: "sensei.read-only.user-mcp-write", persona: "sensei", since: 4, tier: "A", agents: "tier-a",
    title: "A write-capable MCP server in the user's config cannot write (open risk 10)",
    async run(context) {
      await userConfigSeeds(context.agent, context.root, context.home);
      const endpoint = await context.loopback({ name: "dojo_seeded_write", input: {} });
      const run = await runSenseiModel(context, endpoint, { prompt: "Introduce the lesson." });
      expect(existsSync(join(context.root, "seeded-mcp-wrote")), diagnosticsOf(endpoint)).toBe(false);
      expect(run.parts.some(part => part.type === "tool-approval-request")).toBe(false);
    },
  },
  {
    id: "sensei.isolation.user-config", persona: "sensei", since: 4, tier: "A", agents: "tier-a",
    title: "No seeded user config reaches the model; the seeded MCP server never starts (D34)",
    async run(context) {
      await userConfigSeeds(context.agent, context.root, context.home);
      const endpoint = await context.loopback();
      const run = await runSenseiModel(context, endpoint, { prompt: "Introduce the lesson." });
      const requests = JSON.stringify(endpoint.requests);
      const log = join(context.root, "seeded-mcp.log");
      const seen = { mcp: existsSync(log), skill: requests.includes(seedMarkers.skill), rules: requests.includes(seedMarkers.rules) };
      await observe(context.agent, "userConfig.sensei", seen);
      expect(run.failure, diagnosticsOf(endpoint)).toBeUndefined();
      expect(run.text).toBe("Ready to teach.");
      expect(seen, diagnosticsOf(endpoint)).toEqual({ mcp: false, skill: false, rules: false });
    },
  },
  {
    id: "sensei.read-only.absolute-path-reads", persona: "sensei", since: 4, tier: "A", agents: "tier-a",
    title: "Absolute-path reads are recorded (open risk 13)",
    async run(context) {
      const secret = join(context.root, "outside/secret.txt");
      await mkdir(join(context.root, "outside"), { recursive: true });
      await writeFile(secret, "ABSOLUTE-PATH-MARKER\n");
      const endpoint = await context.loopback(undefined, scriptedCalls([nativeCalls[context.agent].read(secret)]));
      await runSenseiModel(context, endpoint, { prompt: "Introduce the lesson." });
      await observe(context.agent, "absolutePathReads", [{ path: "<case root>/outside/secret.txt", read: JSON.stringify(endpoint.requests).includes("ABSOLUTE-PATH-MARKER") }]);
    },
  },
  {
    id: "sensei.resume-failure.one-replacement", persona: "sensei", since: 4, tier: "A", agents: "tier-a",
    title: "A failed resume is replaced exactly once (D28)",
    async run(context) {
      const endpoint = await context.loopback();
      const first = await runSenseiModel(context, endpoint, { prompt: "Introduce the lesson.", eveSessionId: `eve-resume-${context.agent}` });
      expect(first.failure, diagnosticsOf(endpoint)).toBeUndefined();
      expect(first.checkpoint).toBeDefined();
      const failures: ResumeFailure[] = [];
      const real = createLocalHarnessSandbox(context.root, { environment: first.environment });
      const failing = { ...real, resumeSession: async () => { throw new Error("The native session is gone."); } } as unknown as typeof real;
      const second = await runSenseiModel(context, endpoint, { prompt: "Continue the lesson.", eveSessionId: `eve-resume-${context.agent}`,
        sandbox: failing, checkpoint: first.checkpoint, onResumeFailure: failure => { failures.push(failure); } });
      expect(second.failure, diagnosticsOf(endpoint)).toBeInstanceOf(ResumeFailedError);
      expect(second.failure).not.toHaveProperty("statusCode");
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ sessionId: `eve-resume-${context.agent}`, agent: context.agent });
      // The replacement the UI server makes: a fresh call with no checkpoint
      const fresh = await runSenseiModel(context, endpoint, { prompt: "Introduce the lesson again." });
      expect(fresh.failure, diagnosticsOf(endpoint)).toBeUndefined();
      expect(fresh.text).toBe("Ready to teach.");
    },
  },
  {
    id: "sensei.host-port.rerun-no-duplicate", persona: "sensei", since: 4, tier: "A", agents: "tier-a",
    title: "A rerun host-port call does not duplicate its effect",
    async run(context) {
      const endpoint = await context.loopback({ name: "dojo_context", input: {} });
      // The first run answers late, so the driver stops the host while the call is open
      const port = await hostPort(context, { context: () => new Promise(resolve => setTimeout(resolve, 3_000)) });
      const ended = await runHost(context, endpoint, harnessPath, { scenario: "rerun-no-duplicate", persona: "sensei", hostPort: port.url }).done;
      const diagnostics = diagnosticsOf(endpoint, ended.output);
      expect(ended.error, diagnostics).toBeUndefined();
      const rerun = ended.results.find(entry => entry.step === "rerun") as { outcome: string };
      expect(rerun, diagnostics).toBeDefined();
      // Every key ran its handler once, however often Eve called with it (step-4 plan, decision 44)
      const keys = port.recorded("context").map(call => call.idempotencyKey).filter(key => key.includes(":"));
      expect(keys.length, diagnostics).toBeGreaterThan(0);
      expect([...port.executions.values()].every(count => count === 1), diagnostics).toBe(true);
      await observe(context.agent, "hostPortRerun", { calls: keys.length, keys: new Set(keys).size, outcome: rerun.outcome });
    },
  },
  {
    id: "sensei.acp.rerun-after-model-change", persona: "sensei", since: 4, tier: "A", agents: ["grok"],
    title: "An ACP agent reruns after a model change",
    async run(context) {
      const endpoint = await context.loopback();
      const first = await runSenseiModel(context, endpoint, { prompt: "Introduce the lesson.", eveSessionId: "eve-acp-rerun" });
      expect(first.failure, diagnosticsOf(endpoint)).toBeUndefined();
      // The same call again (same prompt and checkpoint) on the second model: it completes, or fails with a typed error
      const previous = context.wiring.firstModel;
      context.wiring.firstModel = context.wiring.secondModel.selection;
      try {
        const rerun = await runSenseiModel(context, endpoint, { prompt: "Introduce the lesson.", eveSessionId: "eve-acp-rerun", checkpoint: first.checkpoint?.slice(0, 0) });
        await observe(context.agent, "acpRerunAfterModelChange", { completed: rerun.failure === undefined, error: rerun.failure instanceof Error ? rerun.failure.name : undefined });
        if (rerun.failure !== undefined) expect(rerun.failure).toBeInstanceOf(Error);
        else expect(rerun.text).toBe("Ready to teach.");
      } finally { context.wiring.firstModel = previous; }
    },
  },
  {
    id: "sensei.acp.model-probe", persona: "sensei", since: 4, tier: "A", agents: ["grok"],
    title: "The ACP model probe lists Grok's models and leaves GROK_HOME unchanged (open risk 3)",
    async run(context) {
      const endpoint = await context.loopback();
      const grokHome = join(context.home, ".grok");
      // Grok's own diagnostic log grows with every run; it is not history or configuration
      const snapshot = async () => Object.fromEntries(Object.entries(await snapshotDirectory(grokHome)).filter(([path]) => !path.startsWith("bin") && !path.startsWith("logs")));
      const executable = bootstrapBinary("grok", await pinnedCli("grok"), agentHome("grok"));
      const probe = () => acpModels("grok", AbortSignal.timeout(60_000), { executable, environment: { ...context.environment(endpoint), ...context.wiring.auth(endpoint) } });
      // Grok initialises a fresh GROK_HOME on its first run, as any use of the CLI would; a user's home is past that
      const fresh = await snapshot();
      await probe();
      const initialised = await snapshot();
      await observe(context.agent, "grokFirstRunChangedHome", Object.keys(initialised).filter(path => initialised[path] !== fresh[path]));
      const models = await probe();
      expect(models.map(model => model.id), diagnosticsOf(endpoint)).toEqual(expect.arrayContaining(["fixture-first", "fixture-second"]));
      expect(await snapshot()).toEqual(initialised);
    },
  },
  {
    id: "sensei.kata.host-tool-turn", persona: "sensei", since: 5, tier: "A", agents: "tier-a",
    title: "Kata Sensei calls Check through the host port",
    async run(context) {
      const endpoint = await context.loopback({ name: "dojo_lesson_verify", input: {} });
      const port = await hostPort(context, { mode: "katas" });
      const ended = await runHost(context, endpoint, harnessPath, { scenario: "host-tool-turn", persona: "sensei", hostPort: port.url }).done;
      const diagnostics = diagnosticsOf(endpoint, ended.output);
      expect(ended.error, diagnostics).toBeUndefined();
      const replied = ended.results.find(entry => entry.step === "replied") as { reply: string; sessionId: string };
      expect(replied?.reply, diagnostics).toBe("Ready to teach.");
      const firstMain = endpoint.requests.findIndex((_request, index) => endpoint.toolLists[index]?.length);
      expect(offers(endpoint, firstMain, "dojo_lesson_verify"), diagnostics).toBe(true);
      expect(JSON.stringify(endpoint.requests[firstMain]).split("KATA-FILE-MARKER").length - 1, diagnostics).toBe(1);
      const keys = [...port.executions.keys()].filter(key => port.recorded("check").some(call => call.idempotencyKey === key));
      expect(keys, diagnostics).toHaveLength(1);
      expect(keys[0]!.startsWith(`${replied.sessionId}:`)).toBe(true);
      expect(port.executions.get(keys[0]!)).toBe(1);
      expect(requestsCarrying(endpoint, "KATA-REPORT-MARKER").length, diagnostics).toBeGreaterThan(0);
    },
  },
  {
    id: "sensei.kata.ask-answer-across-restart", persona: "sensei", since: 5, tier: "A", agents: "tier-a",
    title: "Kata Sensei parks a question across a host restart",
    async run(context) {
      const endpoint = await context.loopback({ name: "ask_question", input: { question: "Which learner?" } });
      const port = await hostPort(context, { mode: "katas" });
      const ended = await runHost(context, endpoint, harnessPath, { scenario: "ask-answer-across-restart", persona: "sensei", hostPort: port.url }).done;
      const diagnostics = diagnosticsOf(endpoint, ended.output);
      expect(ended.error, diagnostics).toBeUndefined();
      const started = ended.results.filter(entry => entry.step === "started");
      expect(started).toHaveLength(2);
      expect(started[0]!.secret).not.toBe(started[1]!.secret);
      const parked = ended.results.find(entry => entry.step === "parked") as { interactions: Array<{ prompt: string }> };
      expect(parked.interactions[0]?.prompt, diagnostics).toBe("Which learner?");
      const answered = ended.results.find(entry => entry.step === "answered") as { reply: string };
      expect(answered?.reply, diagnostics).toBe("Ready to teach.");
      // The restarted host's requests still offer the kata tools
      const lastMain = endpoint.toolLists.map((list, index) => list.length ? index : -1).reduce((last, index) => Math.max(last, index), -1);
      expect(offers(endpoint, lastMain, "dojo_lesson_verify"), diagnostics).toBe(true);
      expect(port.recorded("turn.settled").map(call => (call.input as { outcome?: string }).outcome)).toContain("completed");
    },
  },
  {
    id: "sensei.kata.cancel-pending-host-tool", persona: "sensei", since: 5, tier: "A", agents: "tier-a",
    title: "Kata Sensei cancels with a host tool pending",
    async run(context) {
      const endpoint = await context.loopback({ name: "dojo_lesson_verify", input: {} });
      let releaseCheck = () => {};
      const released = new Promise<void>(resolve => { releaseCheck = resolve; });
      context.defer(() => releaseCheck());
      const port = await hostPort(context, { mode: "katas", check: () => released });
      const host = runHost(context, endpoint, harnessPath, { scenario: "cancel-pending-host-tool", persona: "sensei", hostPort: port.url });
      await host.step("cancelled");
      await expect.poll(() => port.recorded("turn.settled").map(call => (call.input as { outcome?: string }).outcome), { timeout: 15_000 }).toContain("cancelled");
      await expectEvicted(context);
      const requests = endpoint.requests.length;
      releaseCheck();
      await new Promise(resolve => setTimeout(resolve, 2000));
      expect(endpoint.requests.length, "no model request after the cancel").toBe(requests);
      host.send("done");
      expect((await host.done).exitCode).toBe(0);
    },
  },
  {
    id: "sensei.kata.resume-after-eviction", persona: "sensei", since: 5, tier: "A", agents: "tier-a",
    title: "Kata Sensei resumes after eviction",
    async run(context) {
      const endpoint = await context.loopback({ name: "dojo_lesson_verify", input: {} });
      let releaseCheck = () => {};
      const released = new Promise<void>(resolve => { releaseCheck = resolve; });
      context.defer(() => releaseCheck());
      const port = await hostPort(context, { mode: "katas", check: () => released });
      const host = runHost(context, endpoint, harnessPath, { scenario: "resume-after-eviction", persona: "sensei", hostPort: port.url });
      await host.step("cancelled");
      await expectEvicted(context);
      releaseCheck();
      host.send("continue");
      const continued = await host.step("continued");
      expect(continued.reply, diagnosticsOf(endpoint)).toMatch(/Ready to teach\.$/u);
      const request = requestsCarrying(endpoint, "Continue the lesson.").at(-1);
      expect(request, diagnosticsOf(endpoint)).toBeDefined();
      expect(JSON.stringify(request!.request)).toContain("Introduce the lesson.");
      host.send("done");
      expect((await host.done).exitCode).toBe(0);
    },
  },
  {
    id: "sensei.guard.write-restored", persona: "sensei", since: 5, tier: "A", agents: "scripted",
    title: "The guard restores a native write",
    async run(context) {
      const guarded = await scriptedGuard(context);
      const run = await runScriptedModel(context, { prompt: `Native fs ${JSON.stringify({ op: "write", path: guarded.file, content: "native write\n" })}` });
      expect(run.failure).toBeUndefined();
      await guarded.report(run.parked);
      expect(guarded.verdicts.map(verdict => verdict.action)).toEqual(["restored"]);
      expect(await readFile(guarded.file, "utf8")).toBe("export const answer = 0;\n");
      expect(await readFile(guarded.verdicts[0]!.quarantined!, "utf8")).toBe("native write\n");
    },
  },
  {
    id: "sensei.guard.delete-restored", persona: "sensei", since: 5, tier: "A", agents: "scripted",
    title: "The guard restores a native delete",
    async run(context) {
      const guarded = await scriptedGuard(context);
      const run = await runScriptedModel(context, { prompt: `Native fs ${JSON.stringify({ op: "delete", path: guarded.file })}` });
      expect(run.failure).toBeUndefined();
      await guarded.report(run.parked);
      expect(guarded.verdicts.map(verdict => verdict.action)).toEqual(["recreated"]);
      expect(await readFile(guarded.file, "utf8")).toBe("export const answer = 0;\n");
      expect(existsSync(guarded.quarantine) ? await readdir(guarded.quarantine) : []).toEqual([]);
    },
  },
  {
    id: "sensei.guard.create-restored", persona: "sensei", since: 5, tier: "A", agents: "scripted",
    title: "The guard removes a native create",
    async run(context) {
      const guarded = await scriptedGuard(context, { create: true });
      const run = await runScriptedModel(context, { prompt: `Native fs ${JSON.stringify({ op: "create", path: guarded.file, content: "created natively\n" })}` });
      expect(run.failure).toBeUndefined();
      await guarded.report(run.parked);
      expect(guarded.verdicts.map(verdict => verdict.action)).toEqual(["removed"]);
      expect(existsSync(guarded.file)).toBe(false);
      expect(await readFile(guarded.verdicts[0]!.quarantined!, "utf8")).toBe("created natively\n");
    },
  },
  {
    id: "sensei.guard.write-after-pause", persona: "sensei", since: 5, tier: "A", agents: "scripted",
    title: "A write after the pause is not restored, and is recorded (accepted residual)",
    async run(context) {
      const guarded = await scriptedGuard(context);
      const run = await runScriptedModel(context, { ask: true,
        prompt: `Native fs ${JSON.stringify({ op: "write", path: guarded.file, content: "written while parked\n", after: "suspend", delayMs: 500 })}` });
      expect(run.failure).toBeUndefined();
      expect(run.parked).toBe(true);
      await guarded.report(run.parked);
      expect(guarded.verdicts.map(verdict => verdict.action)).toEqual(["unchanged"]);
      await new Promise(resolve => setTimeout(resolve, 1_000));
      expect(await readFile(guarded.file, "utf8")).toBe("written while parked\n");
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(await readFile(guarded.file, "utf8")).toBe("written while parked\n");
      for (const agent of agents) await observe(agent, "guardWriteAfterPause", true);
    },
  },
  {
    id: "sensei.guard.host-port-down-at-pause", persona: "sensei", since: 5, tier: "A", agents: "scripted",
    title: "The guard handles a host port that is down at the pause",
    async run(context) {
      const guarded = await scriptedGuard(context, { portDown: true });
      const run = await runScriptedModel(context, { ask: true,
        prompt: `Native fs ${JSON.stringify({ op: "write", path: guarded.file, content: "written while the port was down\n", after: "suspend", delayMs: 500 })}` });
      expect(run.failure).toBeUndefined();
      await guarded.report(run.parked);
      // The pause reached nothing: the window stays open and the write lands
      expect(guarded.verdicts).toEqual([]);
      expect(await guarded.guard.list()).toHaveLength(1);
      await new Promise(resolve => setTimeout(resolve, 1_000));
      expect(await readFile(guarded.file, "utf8")).toBe("written while the port was down\n");
      // As the UI server's start verifies every persisted window
      const verdicts = await Promise.all((await guarded.guard.list()).map(window => guarded.guard.verify(window.id)));
      expect(verdicts.map(verdict => verdict?.action)).toEqual(["restored"]);
      expect(await readFile(guarded.file, "utf8")).toBe("export const answer = 0;\n");
      expect(await readFile(verdicts[0]!.quarantined!, "utf8")).toBe("written while the port was down\n");
    },
  },
  {
    id: "sensei.check.during-working-turn", persona: "sensei", since: 5, tier: "A", agents: "tier-a",
    title: "Check during a working turn, then settle (open risk 4)",
    async run(context) {
      const endpoint = await context.loopback();
      const held = endpoint.holdNextResponse(holdsTurn);
      context.defer(() => held.release());
      let host: ReturnType<typeof runHost> | undefined;
      let sessionId = "";
      const report = (n: number) => host?.send(`report:${JSON.stringify({ text: `[dojo:check] Ran lesson checks.\n\n{"report":"CHECK-REPORT-${n}"}`, key: `check:${sessionId}:${n}` })}`);
      let settles = 0;
      let modelBeforeAnswer: boolean | undefined;
      const port = await hostPort(context, { mode: "katas",
        handlers: { "turn.settled": async () => {
          const n = ++settles;
          // The first settle answers after 1 s; the report goes once that answer is written (onAnswered), as the UI server's afterAnswer does
          if (n === 1) await new Promise(resolve => setTimeout(resolve, 1_000));
          // The report's own settle is held 2 s while the second report is sent: does Eve start its model call before the answer?
          if (n === 2) {
            report(2);
            const until = Date.now() + 2_000;
            while (Date.now() < until && !requestsCarrying(endpoint, "CHECK-REPORT-2").length) await new Promise(resolve => setTimeout(resolve, 50));
            modelBeforeAnswer = requestsCarrying(endpoint, "CHECK-REPORT-2").length > 0;
            await new Promise(resolve => setTimeout(resolve, Math.max(0, until - Date.now())));
          }
          return { ok: true };
        } },
        onAnswered: call => { if (call.method === "turn.settled" && settles === 1) report(1); },
      });
      host = runHost(context, endpoint, harnessPath, { scenario: "check-during-turn", persona: "sensei", hostPort: port.url });
      const working = await host.step("working") as { sessionId: string; turnId: string };
      sessionId = working.sessionId;
      await held.started;
      held.release();
      const first = await host.step(`reported:check:${sessionId}:1`, 60_000) as { status: number; deliveryId: string | null; at: number };
      expect(first.status, diagnosticsOf(endpoint)).toBe(202);
      await expect.poll(() => settles, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
      const firstAnswered = port.recorded("turn.settled")[0]!;
      expect(requestsCarrying(endpoint, "CHECK-REPORT-1").length, diagnosticsOf(endpoint)).toBeGreaterThan(0);
      const turns = new Set(port.recorded("turn.settled").map(call => (call.input as { turnId?: string }).turnId));
      expect(turns.size, "the report starts its own turn").toBeGreaterThanOrEqual(2);
      expect((firstAnswered.input as { turnId?: string }).turnId).toBe(working.turnId);
      await host.step(`reported:check:${sessionId}:2`, 60_000);
      await expect.poll(() => settles, { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
      // Each report's delivery is consumed once
      await expect.poll(() => port.recorded("delivery.consumed").filter(call => (call.input as { deliveryId?: string }).deliveryId === first.deliveryId).length, { timeout: 15_000 }).toBe(1);
      await observe(context.agent, "modelBeforeSettleHookAnswered", modelBeforeAnswer);
      host.send("done");
      expect((await host.done).exitCode).toBe(0);
    },
  },
  {
    id: "sensei.switch.timeout-marks-interrupted", persona: "sensei", since: 5, tier: "A", agents: "tier-a",
    title: "An agent switch that times out marks the turn interrupted",
    async run(context) {
      const endpoint = await context.loopback();
      const held = endpoint.holdNextResponse(holdsTurn);
      context.defer(() => held.release());
      const interrupted = new Set<string>();
      const port = await hostPort(context, { mode: "katas", interrupted });
      const host = runHost(context, endpoint, harnessPath, { scenario: "interrupted-after-kill", persona: "sensei", hostPort: port.url });
      const working = await host.step("working") as { sessionId: string; turnId: string };
      await held.started;
      // The switch timeout's host stop; the held response stays held, so a native process the killed host left (which the restarted host
      // reaps) can't send another request either
      host.kill();
      await host.done;
      interrupted.add(working.turnId);
      // Main-loop requests (those offering tools): an agent's own side requests, such as OpenCode's title, are not the turn
      const mainLoop = () => endpoint.requests.filter((_request, index) => endpoint.toolLists[index]?.length).length;
      const requests = mainLoop();
      const recovered = await runHost(context, endpoint, harnessPath, { scenario: "recover-session", persona: "sensei", hostPort: port.url,
        args: ["--session", working.sessionId, "--turn", working.turnId] }).done;
      const diagnostics = diagnosticsOf(endpoint, recovered.output);
      expect(recovered.error, diagnostics).toBeUndefined();
      const result = recovered.results.find(entry => entry.step === "recovered") as { outcome: string; error: { code?: string; message?: string } | null };
      // Recovered within the bound, the run fails before any native call (turn.check refused it); otherwise Eve leaves it open (decision 66)
      expect(["failed", "open"], diagnostics).toContain(result?.outcome);
      expect(mainLoop(), `no model request after the restart: ${diagnostics}`).toBe(requests);
      if (result.outcome === "failed") {
        expect(port.recorded("turn.settled").map(call => (call.input as { outcome?: string }).outcome)).toContain("failed");
        expect(port.recorded("turn.check").some(call => (call.input as { turnId?: string }).turnId === working.turnId), diagnostics).toBe(true);
      }
      await observe(context.agent, "interruptedTurnRecovery", result.outcome);
      await observe(context.agent, "interruptedTurnError", result.error ? { code: result.error.code ?? null, message: result.error.message ?? null } : null);
    },
  },
  {
    id: "sensei.switch.during-working-turn", persona: "sensei", since: 5, tier: "A", agents: "tier-a",
    title: "An agent switch during a working turn",
    async run(context) {
      const endpoint = await context.loopback();
      const held = endpoint.holdNextResponse(holdsTurn);
      context.defer(() => held.release());
      const port = await hostPort(context, { mode: "katas" });
      const host = runHost(context, endpoint, harnessPath, { scenario: "switch-during-turn", persona: "sensei", hostPort: port.url });
      await host.step("working");
      await held.started;
      host.send("cancel");
      const cancelled = await host.step("cancelled") as { outcome: string; ms: number };
      expect(cancelled.outcome, diagnosticsOf(endpoint)).toBe("cancelled");
      expect(cancelled.ms).toBeLessThan(10_000);
      held.release();
      const closed = await host.step("closed") as { processes: string[] };
      expect(closed.processes).toEqual([]);
      const prompts = requestsCarrying(endpoint, "Introduce the lesson.").length;
      await host.step("restarted");
      expect(requestsCarrying(endpoint, "Introduce the lesson.").length, "the new host never runs the cancelled turn's prompt").toBe(prompts);
      expect((await host.done).exitCode).toBe(0);
    },
  },
  {
    id: "sensei.host.start-after-eve-version-change", persona: "sensei", since: 5, tier: "A", agents: "tier-a",
    title: "A host start after an Eve version change closes a working session's window",
    async run(context) {
      const endpoint = await context.loopback();
      let settleCalls = 0;
      let settleSeen = () => {};
      const seen = new Promise<void>(resolve => { settleSeen = resolve; });
      const port = await hostPort(context, { mode: "katas", handlers: { "turn.settled": async () => {
        settleCalls++;
        settleSeen();
        // Held: the host is killed while this call is open, as a host is stopped with its settle unreported
        await new Promise(() => {});
      } } });
      const host = runHost(context, endpoint, harnessPath, { scenario: "settle-hook-lost", persona: "sensei", hostPort: port.url });
      const working = await host.step("working") as { sessionId: string; turnId: string };
      // The guard window the UI server opened for the turn
      const file = join(context.root, "solution.ts");
      await writeFile(file, "export const answer = 0;\n");
      const guard = createFileGuard(join(context.root, "guard"));
      const window = await guard.open(working.sessionId, file);
      await seen;
      host.kill();
      await host.done;
      const inspected = await runHost(context, endpoint, harnessPath, { scenario: "inspect-session", persona: "sensei", hostPort: port.url,
        args: ["--session", working.sessionId] }).done;
      const diagnostics = diagnosticsOf(endpoint, inspected.output);
      expect(inspected.error, diagnostics).toBeUndefined();
      const result = inspected.results.find(entry => entry.step === "inspected") as { active: string | null; settled: string[] };
      expect(result?.active, diagnostics).toBeNull();
      expect(settleCalls, "Eve does not run the settle hook again after a restart").toBe(1);
      // What the reconcile does for a turn with no active run: verify and close its window
      expect(await guard.verify(window.id)).toMatchObject({ action: "unchanged" });
      expect(await guard.list()).toEqual([]);
    },
  },
  later(6, "kyoshi", "kyoshi.switch.away-and-back", "Switching away and back continues the old Kyoshi conversation (D31)",
    { run: context => switchAwayAndBack(context, "kyoshi", "same-session") }),
  later(6, "sensei", "sensei.switch.away-and-back", "Switching away and back continues the old Sensei conversation (D31)",
    { run: context => switchAwayAndBack(context, "sensei", "same-session") }),
  later(6, "kyoshi", "kyoshi.switch.new-agent-new-session", "After an agent switch the page opens a new Kyoshi session (D29)",
    { run: context => switchAwayAndBack(context, "kyoshi", "new-session") }),
  later(6, "sensei", "sensei.switch.new-agent-new-session", "After an agent switch the page opens a new Sensei session (D29)",
    { run: context => switchAwayAndBack(context, "sensei", "new-session") }),
  later(7, "sensei", "sensei.evaluation.trial-loopback", "An evaluation trial runs against the loopback model", { run: trialLoopback }),
  later(8, "sensei", "sensei.tier-b.latency", "Median time to first output is at most 15 s", { tier: "B" }),
  later(8, "sensei", "sensei.tier-b.leave-cancels-begin-turns", "Leaving N lessons cancels their begin turns", { tier: "B" }),
  later(8, "sensei", "sensei.tier-b.two-hosts-one-agent", "Two hosts on one agent (open risk 6)", { tier: "B" }),
  later(8, "sensei", "sensei.tier-b.host-memory", "Host memory", { tier: "B" }),
  later(8, "kyoshi", "kyoshi.tier-b.cold-start", "Kyoshi cold start", { tier: "B" }),
];

/** Step 7's per-agent half of an evaluation trial (step-7 plan, "Conformance cases"; the whole trial is test:evaluation): the learner,
 *  fixture-generator and judge one-shots on this agent, read-only and tool-free, and a trial host's usage ceiling. */
async function trialLoopback(context: CaseContext) {
  const role = (prompt: string) => prompt.split("\n")[0]!.split(". ")[0]!;
  const markers = { learner: role(evaluationPrompts.learner), fixture: role(evaluationPrompts.fixtureGenerator), judge: role(evaluationPrompts.teachingJudge) };
  const learnerText = "I think the total starts at zero.";
  const fixture = { uncertainty: "What is the total before anything is added?", terminology: "What does accumulator mean?",
    misconception: "An empty list has no total.", wrong: "export const total = () => 1;", solved: "export const total = () => 0;", review: "Why zero?" };
  const verdict = { criteria: criterionIds.map(id => ({ id, pass: true, evidence: "Observed.", improvement: "None." })), overall: "pass", limitation: "A fixture." };
  const roleOf = (request: unknown): "learner" | "fixture" | "judge" | undefined => {
    const text = JSON.stringify(request);
    return text.includes(markers.judge) ? "judge" : text.includes(markers.fixture) ? "fixture" : text.includes(markers.learner) ? "learner" : undefined;
  };
  const answer = { learner: learnerText, fixture: JSON.stringify(fixture), judge: JSON.stringify(verdict) };
  const endpoint = await context.loopback(undefined, { respondText: (input: unknown) => { const name = roleOf(input); return name ? answer[name] : undefined; } });
  const model = context.wiring.hostModel ?? context.wiring.firstModel;
  const shots = await runHost(context, endpoint, harnessPath, { scenario: "one-shot", persona: "sensei", ...(model ? { model } : {}) }).done;
  const diagnostics = diagnosticsOf(endpoint, shots.output);
  expect(shots.error, diagnostics).toBeUndefined();
  const answers: Record<string, { text: string; processes: string[] }> = Object.fromEntries(shots.results.filter(result => result.step === "one-shot")
    .map(result => [String(result.role), result as unknown as { text: string; processes: string[] }]));
  expect(answers.learner?.text, diagnostics).toBe(learnerText);
  expect(parseGeneratedFixture(answers.fixture!.text)).toEqual(fixture);
  expect(parseVerdict(JSON.parse(answers.judge!.text))).toMatchObject({ overall: "pass" });
  // No native process is left after any call
  const left = Object.values(answers).map(answer => answer.processes.length);
  expect(left, diagnostics).toEqual([0, 0, 0]);
  // Every request offered only the read-only built-ins: a one-shot has no Eve tools
  const { native, keys } = readOnlyToolNames(context.agent, []);
  const allowed = new Set([...native, ...keys, ...Object.keys(toolListExtras[context.agent])]);
  expect([...new Set(endpoint.toolLists.flat())].filter(name => !allowed.has(name)), diagnostics).toEqual([]);
  // The learner and the fixture generator never see the lesson's teaching guidance
  for (const request of endpoint.requests.filter(request => roleOf(request) === "learner" || roleOf(request) === "fixture")) {
    expect(JSON.stringify(request)).not.toContain("SENSEI-GUIDANCE-MARKER");
  }
  await observe(context.agent, "oneShotProcessesLeft", left.reduce((sum, count) => sum + count, 0));

  // The ceiling: the first message settles with the loopback's reply; the second opens Eve's budget prompt before any request for it
  const port = await hostPort(context);
  const host = runHost(context, endpoint, harnessPath, { scenario: "usage-ceiling", persona: "sensei", hostPort: port.url });
  const first = await host.step("first") as { status: string; reply?: string; budget: boolean };
  expect(first, diagnosticsOf(endpoint)).toMatchObject({ budget: false });
  expect(first.reply).toMatch(/Ready to teach\.$/u);
  const requests = requestsCarrying(endpoint, "Continue the lesson.").length;
  host.send("second");
  const second = await host.step("second") as { budget: boolean; budgetPromptOnMessage: number | null };
  expect(second.budgetPromptOnMessage, diagnosticsOf(endpoint)).toBe(2);
  expect(requestsCarrying(endpoint, "Continue the lesson.").length, "the budget prompt opens before the second message's model call").toBe(requests);
  expect(await host.step("cancelled")).toMatchObject({ outcome: "cancelled" });
  expect(await host.step("closed")).toMatchObject({ processes: [] });
  expect((await host.done).exitCode).toBe(0);
  await observe(context.agent, "budgetPromptOnMessage", second.budgetPromptOnMessage);
}

// A step cannot raise implementedStep and leave a case behind; this throws at collection, in every run.
for (const entry of cases) {
  if (entry.since <= implementedStep && !entry.run) throw new Error(`${entry.id} is due in step ${entry.since} but has no body`);
}
const allAgents: TierAAgent[] = tierAAgents({});
const agents: TierAAgent[] = tierAAgents();   // narrowed by DOJO_CONFORMANCE_AGENTS
const due = cases.filter(entry => entry.since <= implementedStep && entry.tier === "A");
const runsOn = (entry: ConformanceCase, agent: TierAAgent) => entry.agents === "tier-a" || (Array.isArray(entry.agents) && entry.agents.includes(agent));
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
      for (const entry of due.filter(item => runsOn(item, agent))) {
        it(title(entry), async () => {
          const context = await openCase(agent, entry.id, harnessPath, { course: !entry.id.includes(".host.") });
          try { await entry.run!(context); }
          finally { await context.close(); }
          await expectNoNativeProcesses(context.markers);
        }, 240_000);
      }
    });
  }
  // Agent-independent: once per Vitest process, under "scripted"; each per-agent process's report carries them for its agent (decision 5)
  describe("scripted", () => {
    for (const entry of due.filter(item => item.agents === "scripted")) {
      it(title(entry), async () => {
        const context = await openCase(agents[0]!, entry.id, harnessPath);
        try { await entry.run!(context); }
        finally { await context.close(); }
        await expectNoNativeProcesses(context.markers);
      }, 120_000);
    }
  });
  describe("due in a later step", () => {
    for (const entry of cases.filter(item => item.since > implementedStep)) it.todo(title(entry));
  });
});
