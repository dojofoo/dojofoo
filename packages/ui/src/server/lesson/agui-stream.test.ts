import { describe, expect, it } from "vitest";
import { streamAcpAsAgUi } from "./agui-stream";

describe("ACP to AG-UI stream", () => {
  it("emits standard run, reasoning, text, and tool lifecycles", async () => {
    const events = [];
    for await (const event of streamAcpAsAgUi({
      runId: "run-1",
      threadId: "thread-1",
      execute: async (write) => {
        write({ type: "reasoning-start", id: "reasoning-1" });
        write({ type: "reasoning-delta", id: "reasoning-1", delta: "Inspecting" });
        write({ type: "reasoning-end", id: "reasoning-1" });
        write({ type: "tool-input-start", toolCallId: "tool-1", toolName: "dojo_lesson_verify", dynamic: true });
        write({ type: "tool-input-available", toolCallId: "tool-1", toolName: "dojo_lesson_verify", input: {}, dynamic: true });
        write({ type: "tool-output-available", toolCallId: "tool-1", output: { passed: 1 }, dynamic: true });
        write({ type: "text-start", id: "message-1" });
        write({ type: "text-delta", id: "message-1", delta: "Done" });
        write({ type: "text-end", id: "message-1" });
      },
    })) events.push(event);

    expect(events.map(({ type }) => type)).toEqual([
      "RUN_STARTED",
      "REASONING_START",
      "REASONING_MESSAGE_START",
      "REASONING_MESSAGE_CONTENT",
      "REASONING_MESSAGE_END",
      "REASONING_END",
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "RUN_FINISHED",
    ]);
    expect(events[0]).toMatchObject({ runId: "run-1", threadId: "thread-1" });
    expect(events.at(-1)).toMatchObject({ runId: "run-1", threadId: "thread-1" });
    expect(events[6]).toEqual({ type: "TOOL_CALL_START", toolCallId: "tool-1", toolCallName: "dojo_lesson_verify" });
    expect(events[8]).toEqual({ type: "TOOL_CALL_END", toolCallId: "tool-1", metadata: { tanstack: { input: {} } } });
    expect(events[9]).toMatchObject({ metadata: { tanstack: { state: "output-available" } } });
    expect(events[9]).not.toHaveProperty("state");
    expect(events.at(-1)).toMatchObject({ metadata: { tanstack: { finishReason: "stop" } } });
    expect(events.at(-1)).not.toHaveProperty("finishReason");
  });

  it("converts harness failures into RUN_ERROR", async () => {
    const events = [];
    for await (const event of streamAcpAsAgUi({
      runId: "run-error",
      threadId: "thread-1",
      execute: async () => { throw new Error("provider unavailable"); },
    })) events.push(event);
    expect(events.map(({ type }) => type)).toEqual(["RUN_STARTED", "RUN_ERROR"]);
    expect(events[1]).toMatchObject({ message: "provider unavailable" });
    expect(events[1]).toMatchObject({ metadata: { tanstack: { threadId: "thread-1", runId: "run-error" } } });
  });

  it("streams introduction preparation before learner-facing text", async () => {
    const events = [];
    for await (const event of streamAcpAsAgUi({
      runId: "run-introduction",
      threadId: "thread-1",
      execute: async (write) => {
        write({ type: "reasoning-start", id: "reasoning-1" });
        write({ type: "reasoning-delta", id: "reasoning-1", delta: "Finding the lesson file" });
        write({ type: "reasoning-end", id: "reasoning-1" });
        write({ type: "tool-input-start", toolCallId: "read-1", toolName: "read", dynamic: true });
        write({ type: "tool-input-available", toolCallId: "read-1", toolName: "read", input: { path: "solution.ts" }, dynamic: true });
        write({ type: "tool-output-available", toolCallId: "read-1", output: "file contents", dynamic: true });
        write({ type: "text-start", id: "welcome" });
        write({ type: "text-delta", id: "welcome", delta: "Welcome to the lesson." });
        write({ type: "text-end", id: "welcome" });
        write({ type: "tool-input-start", toolCallId: "later-1", toolName: "dojo_ui_show", dynamic: true });
      },
    })) events.push(event);

    expect(events.map(({ type }) => type)).toEqual([
      "RUN_STARTED",
      "REASONING_START",
      "REASONING_MESSAGE_START",
      "REASONING_MESSAGE_CONTENT",
      "REASONING_MESSAGE_END",
      "REASONING_END",
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "TOOL_CALL_START",
      "RUN_FINISHED",
    ]);
    expect(JSON.stringify(events)).toContain("Finding the lesson file");
    expect(events).toContainEqual(expect.objectContaining({ toolCallId: "read-1" }));
  });

  it("exposes a preparation failure", async () => {
    const events = [];
    for await (const event of streamAcpAsAgUi({
      runId: "run-introduction-error",
      threadId: "thread-1",
      execute: async (write) => {
        write({ type: "reasoning-start", id: "reasoning-1" });
        throw new Error("provider unavailable");
      },
    })) events.push(event);

    expect(events.map(({ type }) => type)).toEqual([
      "RUN_STARTED",
      "REASONING_START",
      "REASONING_MESSAGE_START",
      "RUN_ERROR",
    ]);
  });
});
