import { ChatClient, stream, type UIMessage } from "@tanstack/ai-client";
import { describe, expect, it } from "vitest";
import autoScroll from "./cassettes/auto-scroll.jsonl?raw";
import chainedTools from "./cassettes/chained-tools.jsonl?raw";
import freeText from "./cassettes/free-text.jsonl?raw";
import multipleChoice from "./cassettes/multiple-choice.jsonl?raw";
import thinkingIndicator from "./cassettes/thinking-indicator.jsonl?raw";
import thoughtsAndTools from "./cassettes/thoughts-and-tools.jsonl?raw";
import { parseChatCassette } from "./chat-cassette";

const cassettes = { autoScroll, chainedTools, freeText, multipleChoice, thinkingIndicator, thoughtsAndTools };

describe("AG-UI chat cassettes", () => {
  it.each(Object.entries(cassettes))("%s is consumed by TanStack ChatClient", async (_name, source) => {
    const frames = parseChatCassette(source);
    const chunks = frames.flatMap((frame) => frame.chunk ? [frame.chunk] : []);
    const history = frames.flatMap((frame) => frame.historyMessage ? [frame.historyMessage] : []);
    const prompt = frames.find((frame) => frame.prompt !== undefined)?.prompt;
    expect(prompt).toBeTruthy();
    expect(chunks[0]?.type).toBe("RUN_STARTED");
    expect(chunks.at(-1)?.type).toMatch(/^RUN_(?:FINISHED|ERROR)$/u);
    for (const chunk of chunks) {
      if (chunk.type === "TOOL_CALL_START" || chunk.type === "TOOL_CALL_END") {
        expect(chunk).not.toHaveProperty("toolName");
      }
      if (chunk.type === "TOOL_CALL_END") {
        expect(chunk).not.toHaveProperty("toolCallName");
        expect(chunk).not.toHaveProperty("input");
      }
      if (chunk.type === "TOOL_CALL_RESULT") expect(chunk).not.toHaveProperty("state");
      if (chunk.type === "RUN_FINISHED") expect(chunk).not.toHaveProperty("finishReason");
    }

    let messages: UIMessage[] = [];
    const client = new ChatClient({
      connection: stream(async function* () {
        for (const chunk of chunks) yield chunk;
      }),
      initialMessages: history,
      onMessagesChange: (next) => { messages = next; },
      persistence: false,
      threadId: "cassette-test",
    });
    await client.sendMessage(prompt!);

    expect(messages.some((message) => message.role === "user")).toBe(true);
    expect(messages.some((message) => message.role === "assistant")).toBe(true);
    const calls = messages.flatMap(message => message.parts.filter(part => part.type === "tool-call"));
    for (const chunk of chunks) {
      if (chunk.type === "TOOL_CALL_END") {
        expect(calls.find(call => call.id === chunk.toolCallId)?.input)
          .toEqual(chunk.metadata?.tanstack?.input);
      }
      if (chunk.type === "TOOL_CALL_RESULT") {
        expect(calls.find(call => call.id === chunk.toolCallId)?.state).toBe("complete");
      }
    }
  });
});
