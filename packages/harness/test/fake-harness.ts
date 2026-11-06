import { createJustBashSandbox } from "@ai-sdk/sandbox-just-bash";
import { jsonSchema, tool } from "ai";

/** A minimal HarnessV1 adapter: it records every doStart and replays the parts a test scripts for each prompt. */
export type Emit = (event: Record<string, unknown>) => void;
export type Script = (turn: { prompt: string; emit: Emit }) => void | {
  approve?(answer: { approvalId: string; approved: boolean }, emit: Emit): void;
  result?(result: { toolCallId: string; output: unknown }, emit: Emit): void;
};

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const finishReason = { unified: "stop", raw: "stop" };

export function reply(emit: Emit, text: string) {
  emit({ type: "text-start", id: "t" });
  emit({ type: "text-delta", id: "t", delta: text });
  emit({ type: "text-end", id: "t" });
  emit({ type: "finish-step", finishReason, usage });
  emit({ type: "finish", finishReason, totalUsage: usage });
}

export function fakeHarness(options: { harnessId?: string; builtins?: Record<string, string>; script?: Script } = {}) {
  const parked = new Map<string, ReturnType<Script>>();
  const harnessId = options.harnessId ?? "fake-harness";
  const starts: Array<Record<string, unknown>> = [];
  const approvals: Array<{ approvalId: string; approved: boolean }> = [];
  const compactions: string[] = [];
  const script: Script = options.script ?? (turn => reply(turn.emit, "Ready to teach."));
  const harness = {
    specificationVersion: "harness-v1" as const, harnessId,
    supportsBuiltinToolFiltering: true, supportsBuiltinToolApprovals: true,
    builtinTools: Object.fromEntries(Object.entries(options.builtins ?? {}).map(([key, nativeName]) =>
      [key, { ...tool({ inputSchema: jsonSchema({ type: "object" }) }), nativeName }])),
    async doStart(start: Record<string, unknown> & { sessionId: string; resumeFrom?: { data: { history: string[] } }; continueFrom?: { data: { history: string[] } } }) {
      starts.push(start);
      const history = structuredClone((start.continueFrom ?? start.resumeFrom)?.data.history ?? []);
      const snapshot = (type: string) => ({ type, harnessId, specificationVersion: "harness-v1", data: { history } });
      let pending: ReturnType<Script> | undefined;
      const calls = new Map<string, { toolCallId: string; toolName: string }>();
      const handlers = () => (pending && typeof pending === "object" ? pending : {});
      const control = (emit: Emit, done: PromiseWithResolvers<void>) => ({
        done: done.promise,
        async submitToolResult(result: { toolCallId: string; toolName: string; output: unknown; isError?: boolean }) {
          emit({ type: "tool-result", toolCallId: result.toolCallId, toolName: result.toolName, result: result.output, isError: result.isError });
          const handler = handlers().result;
          if (handler) handler(result, emit);
          else reply(emit, "Ready to teach.");
          done.resolve();
        },
        async submitToolApproval(answer: { approvalId: string; approved: boolean }) {
          approvals.push(answer);
          const handler = handlers().approve;
          if (handler) handler(answer, emit);
          else {
            const call = calls.get(answer.approvalId);
            if (call) emit({ type: "tool-result", toolCallId: call.toolCallId, toolName: call.toolName, result: answer.approved ? "done" : "Permission denied", isError: !answer.approved, dynamic: true });
            reply(emit, answer.approved ? "Approved." : "Denied.");
          }
          done.resolve();
        },
      });
      return {
        sessionId: start.sessionId, isResume: Boolean(start.continueFrom || start.resumeFrom),
        async doCompact() { compactions.push(start.sessionId); },
        async doPromptTurn(turn: { prompt: string; emit: Emit }) {
          history.push(turn.prompt);
          const done = Promise.withResolvers<void>();
          let settled = true;
          let lastCall: { toolCallId: string; toolName: string } | undefined;
          pending = script({ prompt: turn.prompt, emit: event => {
            // A pending approval or host tool keeps the native turn open
            if (event.type === "tool-approval-request" || (event.type === "tool-call" && !event.providerExecuted)) settled = false;
            if (event.type === "tool-call") lastCall = { toolCallId: String(event.toolCallId), toolName: String(event.toolName) };
            if (event.type === "tool-approval-request" && lastCall) calls.set(String(event.approvalId), lastCall);
            turn.emit(event);
          } });
          if (settled) done.resolve();
          else parked.set(start.sessionId, pending);
          return control(turn.emit, done);
        },
        async doContinueTurn(turn: { emit: Emit }) {
          const done = Promise.withResolvers<void>();
          // A resumed turn keeps the handlers of the prompt that parked it, in this process
          pending = parked.get(start.sessionId) ?? pending;
          return control(turn.emit, done);
        },
        async doStop() { return snapshot("resume-session"); },
        async doSuspendTurn() { return snapshot("continue-turn"); },
        async doDestroy() {},
      };
    },
  };
  return { harness, starts, approvals, compactions };
}

/** A just-bash sandbox provider that can resume, as the harness model's checkpoint needs. */
export function fakeSandbox() {
  const sandbox = createJustBashSandbox();
  return { ...sandbox, resumeSession: (options: { sessionId: string }) => sandbox.createSession(options) };
}

export const userPrompt = (text: string) => [{ role: "user" as const, content: [{ type: "text" as const, text }] }];
