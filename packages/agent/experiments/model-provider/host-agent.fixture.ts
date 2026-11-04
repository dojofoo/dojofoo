import { defineAgent, defineDynamic } from "@dojofoo/agent";
import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";
import { createJustBashSandbox } from "@ai-sdk/sandbox-just-bash";
import { rmSync, writeFileSync } from "node:fs";

// Only inference/native storage is scripted. Eve's HTTP server, workflow world,
// compilation and provider/SDK lifecycle run unchanged.
const harness = {
  specificationVersion: "harness-v1" as const,
  harnessId: "host-fixture",
  builtinTools: {},
  async doStart(start: any) {
    const stored = (start.continueFrom ?? start.resumeFrom)?.data;
    const history = [...((start.continueFrom ?? start.resumeFrom)?.data.history ?? [])];
    let pendingCall = stored?.pendingCall;
    // A file change after the turn paused, as a parked native CLI could still make.
    let afterSuspend: { op: string; path: string; content?: string; delayMs?: number } | undefined;
    const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
    const finishReason = { unified: "stop", raw: "stop" };
    const question = { type: "tool-call", toolCallId: "host-question", toolName: "ask_question", input: JSON.stringify({ question: "Review or continue?", options: [{ label: "Review", description: "Review the lesson" }, { label: "Continue", description: "Continue learning" }] }) };
    // The fixture changes files itself with node:fs, as a native CLI running as the user would.
    const changeFile = ({ op, path, content }: { op: string; path: string; content?: string }) => {
      if (op === "write") writeFileSync(path, content ?? "");
      else if (op === "create") writeFileSync(path, content ?? "", { flag: "wx" });
      else if (op === "delete") rmSync(path);
      else throw new Error(`Unknown native file operation ${op}`);
    };
    const reply = (turn: any) => {
      for (const event of [
        { type: "text-start", id: "reply" },
        { type: "text-delta", id: "reply", delta: JSON.stringify({ sessionId: start.sessionId, selectedModel: turn.model, history }) },
        { type: "text-end", id: "reply" },
        { type: "finish-step", finishReason, usage },
        { type: "finish", finishReason, totalUsage: usage },
      ]) turn.emit(event);
    };
    return {
      sessionId: start.sessionId,
      isResume: Boolean(start.resumeFrom || start.continueFrom),
      async doCompact() {
        history.splice(0, history.length, "Native lesson summary.");
      },
      async doPromptTurn(turn: any) {
        const specialist = turn.instructions?.includes("SPECIALIST_INSTRUCTIONS_LOADED");
        if (specialist && turn.instructions.includes("HOST_INSTRUCTIONS_LOADED")) throw new Error("Parent instructions leaked into specialist");
        if (!specialist && !turn.instructions?.includes("HOST_INSTRUCTIONS_LOADED")) throw new Error("Authored instructions missing");
        const tools = turn.tools.map((tool: any) => tool.name);
        if (specialist && (tools.includes("root_only") || tools.includes("agent"))) throw new Error("Root-only tools leaked into specialist");
        if (!specialist && !tools.includes("root_only")) throw new Error("Root tool was not loaded");
        history.push(turn.prompt);
        const native = /^Native fs (\{.*\})$/s.exec(turn.prompt);
        if (native) {
          const operation = JSON.parse(native[1]!);
          if (operation.after === "suspend") {
            afterSuspend = operation;
            pendingCall = { ...question, toolCallId: `${question.toolCallId}-${history.length}` };
            history.push({ native: operation.op, path: operation.path });
            turn.emit(pendingCall);
            return { done: Promise.resolve(), async submitToolResult() {} };
          }
          // providerExecuted tools are the CLI's own, so they are never in turn.tools.
          const call = { toolCallId: `native-fs-${history.length}`, toolName: `native_${operation.op}`, dynamic: true };
          let failure: unknown;
          try { changeFile(operation); } catch (error) { failure = error; }
          history.push({ native: operation.op, path: operation.path });
          turn.emit({ type: "tool-call", ...call, input: JSON.stringify({ path: operation.path }), providerExecuted: true });
          turn.emit({ type: "tool-result", ...call, ...(failure
            ? { result: failure instanceof Error ? failure.message : String(failure), isError: true }
            : { result: { path: operation.path, done: true } }) });
          turn.emit({ type: "finish-step", finishReason: { unified: "tool-calls" }, usage });
          reply(turn);
          return { done: Promise.resolve(), async submitToolResult() {} };
        }
        pendingCall = specialist ? { type: "tool-call", toolCallId: "specialist-read", toolName: "read_file", input: JSON.stringify({ filePath: "/workspace/note.md" }) }
          : turn.prompt === "Ask before continuing" ? question
          : turn.prompt === "Load authoring skill" ? { type: "tool-call", toolCallId: "host-skill", toolName: "eve__skill", input: JSON.stringify({ name: "course-outline" }) }
          : turn.prompt === "Delegate lesson review" ? { type: "tool-call", toolCallId: "host-delegate", toolName: "agent", input: JSON.stringify({ message: "Review this isolated lesson" }) }
          : turn.prompt === "Delegate specialist review" ? { type: "tool-call", toolCallId: "host-specialist", toolName: "reviewer", input: JSON.stringify({ message: "Review this isolated lesson" }) }
          : turn.prompt === "Read lesson note" ? { type: "tool-call", toolCallId: "host-read", toolName: "read_file", input: JSON.stringify({ filePath: "/workspace/note.md" }) }
          : turn.prompt === "Read authoring note" ? { type: "tool-call", toolCallId: "host-course-read", toolName: "read_file", input: JSON.stringify({ filePath: "/course/note.md" }) }
          : turn.prompt === "Write authoring note" ? { type: "tool-call", toolCallId: "host-course-write", toolName: "write_file", input: JSON.stringify({ filePath: "/course/note.md", content: "Edited by Kyoshi.\n" }) }
          : turn.prompt === "Write lesson note" ? { type: "tool-call", toolCallId: "host-write", toolName: "write_file", input: JSON.stringify({ filePath: "/workspace/note.md", content: "Learner progress saved.\n" }) }
          : undefined;
        if (pendingCall) {
          // Native adapters issue a fresh call id per call. Eve 1.0 renames a
          // repeated id, so a fixed id would no longer match the native call.
          pendingCall = { ...pendingCall, toolCallId: `${pendingCall.toolCallId}-${history.length}` };
          if (!tools.includes(pendingCall.toolName)) throw new Error(`Fixture requested unavailable tool ${pendingCall.toolName}; available: ${tools.join(", ")}`);
          turn.emit(pendingCall);
        }
        else reply(turn);
        return { done: Promise.resolve(), async submitToolResult() {} };
      },
      async doContinueTurn(turn: any) {
        const done = Promise.withResolvers<void>();
        if (!pendingCall) throw new Error("Missing pending fixture call");
        turn.emit(pendingCall);
        return { done: done.promise, async submitToolResult(result: any) {
          history.push(pendingCall.toolName === "ask_question" ? { answer: result.output } : { tool: pendingCall.toolName, output: result.output });
          turn.emit({ type: "tool-result", toolCallId: pendingCall.toolCallId, toolName: pendingCall.toolName, result: result.output });
          pendingCall = undefined;
          turn.emit({ type: "finish-step", finishReason: { unified: "tool-calls" }, usage });
          reply(turn);
          done.resolve();
        } };
      },
      async doSuspendTurn() {
        const operation = afterSuspend;
        afterSuspend = undefined;
        if (operation) setTimeout(() => {
          try { changeFile(operation); } catch (error) { console.error("Native file change after suspend failed", error); }
        }, operation.delayMs ?? 0);
        return { type: "continue-turn", specificationVersion: "harness-v1", harnessId: "host-fixture", data: { history, pendingCall } }; },
      async doStop() { return { type: "resume-session", specificationVersion: "harness-v1", harnessId: "host-fixture", data: { history } }; },
      async doDestroy() {},
    };
  },
};
const sandbox = createJustBashSandbox();
// This fixture stores its history only in the native handle, never in the FS.
export default defineAgent({
  model: defineDynamic(async context => ({
    model: experimental_createHarnessModel({
      harness,
      model: `host:${context.session.id}`,
      sandbox: { ...sandbox, resumeSession: options => sandbox.createSession(options) },
    }).model,
    modelContextWindowTokens: 32_000,
  })),
});
