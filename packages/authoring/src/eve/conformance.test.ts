import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "@ai-sdk/provider-utils";
import { HarnessAgent } from "@dojofoo/agent/harness";
import { createLocalHarnessSandbox, createLocalSandbox, prepareHarnessEnvironment } from "@dojofoo/agent/experimental/local";
import { ResumeFailedError } from "@dojofoo/agent/experimental";
import { startHostPortFixture } from "@dojofoo/agent/host-port/fixture";
import type { ResumeFailure } from "@dojofoo/protocol";
import { personaRecordedFrom, type Persona } from "@dojofoo/protocol";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  agentProcesses, caseBaseEnvironment, expectNoNativeProcesses, nativeCalls, nativeLogTail, nativeProcesses, observe, openCase, requestsCarrying, runHost, runKyoshiHost,
  runSenseiModel, scriptedCalls, seedMarkers, snapshotDirectory, stopAfterCancel, toolListExtras, userConfigSeeds,
  type CaseContext, type LoopbackEndpoint, type TierAAgent, type ToolRequest,
} from "./conformance.fixture";
import { acpModels } from "./models";
// @ts-expect-error The conformance scripts are plain JavaScript without declarations.
import { agentHome, bootstrapBinary, conformancePaths, installAgent, needsInstall, pinnedCli, readRecord, tierAAgents } from "../../scripts/conformance-install.mjs";
import instructions from "./instructions";

// Tier A of docs/designs/agent-runtime.md, "Conformance tiers": every registry row with an adapter except Cursor,
// against the loopback model. The case list, its tags and its runner are docs/designs/agent-runtime.steps/step-3.md.
const implementedStep = 4;                                   // each later step raises it
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

/** The host-port fixture a Sensei or Kyoshi host reports to; Sensei's session and course come from it. Its tool-call reads
 *  (keys `<session>:<callId>`) run once per key, as the UI server's idempotency keeps a mutating call's result. */
async function hostPort(context: CaseContext, options: { model?: () => string | undefined; context?: (key: string) => Promise<void> | void } = {}) {
  const executions = new Map<string, number>();
  const memo = new Map<string, Promise<unknown>>();
  const port = await startHostPortFixture({ handlers: {
    session: () => ({ courseId: "first", mode: "interactive", revision: 0, ...(options.model?.() ?? context.wiring.hostModel ?? context.wiring.firstModel
      ? { model: options.model?.() ?? context.wiring.hostModel ?? context.wiring.firstModel } : {}) }),
    context: (_input, call) => {
      const body = { kind: "interactive", hash: "fixture", course: { id: "first", title: "First" }, guidance: "SENSEI-GUIDANCE-MARKER",
        lesson: { title: "Lesson", marker: "ONMESSAGE-CONTEXT-MARKER" } };
      if (!call.idempotencyKey.includes(":")) return body;
      // A tool call: its own marker, and one run per key
      if (!memo.has(call.idempotencyKey)) {
        executions.set(call.idempotencyKey, (executions.get(call.idempotencyKey) ?? 0) + 1);
        memo.set(call.idempotencyKey, Promise.resolve(options.context?.(call.idempotencyKey)).then(() => ({ ...body, toolMarker: "TOOL-CONTEXT-MARKER" })));
      }
      return memo.get(call.idempotencyKey);
    },
  } });
  context.defer(() => port.close());
  return { ...port, executions, recorded: (method: string) => port.calls.filter(call => call.method === method) };
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
  describe("due in a later step", () => {
    for (const entry of cases.filter(item => item.since > implementedStep)) it.todo(title(entry));
  });
});
