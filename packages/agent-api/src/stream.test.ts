import { defaultMessageReducer, type MessageStreamEvent } from "@dojofoo/agent/client";
import { eveChatMessages } from "@dojofoo/authoring/eve/messages";
import { StreamProcessor, type StreamChunk } from "@tanstack/ai";
import { describe, expect, it } from "vitest";
import { turn } from "./fixtures";
import { streamEveRun } from "./stream";

const reducer = defaultMessageReducer();

async function run(stream: (input: Parameters<typeof streamEveRun>[0]) => AsyncGenerator<StreamChunk>, history: MessageStreamEvent[], live: MessageStreamEvent[]) {
  const chunks: StreamChunk[] = [];
  let bytes = 0;
  const initial = history.reduce(reducer.reduce, reducer.initial());
  const processor = new StreamProcessor({ initialMessages: eveChatMessages(initial.messages) });
  for await (const chunk of stream({ events: (async function* () { yield* live; })(), initial, threadId: "s", runId: "r" })) {
    chunks.push(chunk);
    bytes += JSON.stringify(chunk).length;
    processor.processChunk(chunk);
  }
  processor.finalizeStream();
  const texts = processor.getMessages().map(message => message.parts.map(part => part.type === "text" ? part.content : part.type));
  return { chunks, bytes, texts, types: chunks.map(chunk => chunk.type) };
}

const history = (turns: number) => Array.from({ length: turns }, (_, index) => turn(`old-${index}`, `Question ${index}`, ["Answer ".repeat(60)])).flat();

describe("streamEveRun", () => {
  it("reports a stable agent error when the upstream stream fails", async () => {
    const chunks: StreamChunk[] = [];
    const events = (async function* () { throw new Error("Agent connection closed"); })();
    for await (const chunk of streamEveRun({ events, initial: reducer.initial(), threadId: "s", runId: "r" })) chunks.push(chunk);
    expect(chunks.at(-1)).toMatchObject({ type: "RUN_ERROR", code: "agent_stream_failed", message: "Agent connection closed" });
  });
  it("preserves saved history and text on both sides of a tool call", async () => {
    const saved = history(3);
    const live = turn("live", "Read the lesson", ["Let me ", "look"], { tool: true, tail: ["It ", "covers ", "katas."] });
    const result = await run(streamEveRun, saved, live);
    const savedTexts = eveChatMessages(saved.reduce(reducer.reduce, reducer.initial()).messages)
      .map(message => message.parts.map(part => part.type === "text" ? part.content : part.type));
    expect(result.texts.slice(0, savedTexts.length)).toEqual(savedTexts);
    expect(result.texts.at(-1)).toEqual(["Let me look", "tool-call", "tool-result", "It covers katas."]);
    expect(result.types).not.toContain("MESSAGES_SNAPSHOT");
  });

  it("streams replies without resending history or structural snapshots", async () => {
    const live = turn("live", "Hi", Array.from({ length: 300 }, () => "tok "));
    const empty = await run(streamEveRun, [], live);
    const long = await run(streamEveRun, history(30), live);
    expect(long.types.filter(type => type === "TEXT_MESSAGE_CONTENT")).toHaveLength(300);
    expect(long.types).not.toContain("MESSAGES_SNAPSHOT");
    expect(long.bytes).toBe(empty.bytes);
    expect(long.bytes).toBeLessThan(40_000);
    expect(long.types[0]).toBe("RUN_STARTED");
    expect(long.types.at(-1)).toBe("RUN_FINISHED");
    console.info(`API reply: ${empty.bytes} bytes with no history; ${long.bytes} bytes after 30 turns.`);
  });

  it("finishes with the question as an interrupt", async () => {
    const { chunks } = await run(streamEveRun, [], turn("live", "Hi", ["Pick one"], { question: true }));
    expect(chunks.at(-1)).toMatchObject({ type: "RUN_FINISHED", outcome: { type: "interrupt", interrupts: [expect.objectContaining({ id: "live-q" })] } });
  });
});
