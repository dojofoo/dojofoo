import {
  defaultMessageReducer,
  isTurnFailureEvent,
  type EveMessageData,
  type EveMessagePart,
  type MessageStreamEvent,
} from "@dojofoo/agent/client";
import { EventType, uiMessagesToWire, withInterruptBinding, type StreamChunk } from "@tanstack/ai";
import { eveChatMessages, eveQuestion } from "./messages";
import { isEveResponseBoundary } from "./resume";

/** Translate live Eve events into standard AG-UI deltas. Full history is sent
 * once on attach; Eve's reducer remains authoritative for questions and tools. */
export async function* streamEveAsAgUi({ events, initial, threadId, runId, attach = false }: {
  events: AsyncIterable<MessageStreamEvent>;
  initial: EveMessageData;
  threadId: string;
  runId: string;
  attach?: boolean;
}): AsyncGenerator<StreamChunk> {
  const reducer = defaultMessageReducer();
  let data = initial;
  let boundary = false;
  const startedParts = new Set<string>();
  const startedTools = new Set<string>();
  const assistant = (state: EveMessageData, turnId: string) => state.messages.find(message => message.role === "assistant" && message.metadata?.turnId === turnId);
  const textPart = (state: EveMessageData, turnId: string, stepIndex: number, kind: "text" | "reasoning") =>
    assistant(state, turnId)?.parts.find((part): part is Extract<EveMessagePart, { type: "text" | "reasoning" }> => part.type === kind && part.stepIndex === stepIndex);
  function openPart(turnId: string, stepIndex: number, kind: "text" | "reasoning"): StreamChunk[] {
    const message = assistant(data, turnId);
    if (!message) return [];
    const key = `${message.id}:${stepIndex}:${kind}`;
    if (startedParts.has(key)) return [];
    startedParts.add(key);
    const chunks: StreamChunk[] = [{ type: EventType.TEXT_MESSAGE_START, messageId: message.id, role: "assistant" }];
    if (kind === "reasoning") chunks.push(
      { type: EventType.STEP_STARTED, stepName: String(stepIndex) },
      { type: EventType.REASONING_START, messageId: key },
      { type: EventType.REASONING_MESSAGE_START, messageId: key, role: "reasoning" },
    );
    // A snapshot restores UI parts, not the client's transient accumulation.
    const prefix = textPart(initial, turnId, stepIndex, kind)?.text;
    if (prefix) chunks.push(kind === "text"
      ? { type: EventType.TEXT_MESSAGE_CONTENT, messageId: message.id, delta: prefix }
      : { type: EventType.REASONING_MESSAGE_CONTENT, messageId: key, delta: prefix });
    return chunks;
  }
  function openTool(messageId: string, part: Extract<EveMessagePart, { type: "dynamic-tool" }>): StreamChunk[] {
    if (startedTools.has(part.toolCallId)) return [];
    startedTools.add(part.toolCallId);
    const chunks: StreamChunk[] = [{ type: EventType.TOOL_CALL_START, toolCallId: part.toolCallId, toolCallName: part.toolName, parentMessageId: messageId }];
    const prior = initial.messages.flatMap(message => message.parts).find(item => item.type === "dynamic-tool" && item.toolCallId === part.toolCallId);
    if (prior?.type === "dynamic-tool") {
      const prefix = prior.state === "input-streaming" ? prior.inputText : JSON.stringify(prior.input);
      if (prefix) chunks.push({ type: EventType.TOOL_CALL_ARGS, toolCallId: part.toolCallId, delta: prefix });
    }
    return chunks;
  }
  yield { type: EventType.RUN_STARTED, threadId, runId };
  if (attach && data.messages.length) yield messageSnapshot(data);
  try {
    for await (const event of events) {
      if (isTurnFailureEvent(event)) {
        yield { type: EventType.RUN_ERROR, code: event.data.code, message: event.data.message, metadata: { tanstack: { threadId, runId } } };
        return;
      }
      const previous = data;
      data = reducer.reduce(data, event);
      if (event.type === "authorization.required") {
        const message = assistant(data, event.data.turnId);
        if (message) yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId: message.id, delta: `\n\n${event.data.description}` };
      }
      if (event.type === "message.appended" || event.type === "reasoning.appended" || event.type === "message.completed" || event.type === "reasoning.completed") {
        const { turnId, stepIndex } = event.data;
        const kind = event.type.startsWith("reasoning.") ? "reasoning" : "text";
        const message = assistant(data, turnId);
        if (message) {
          yield* openPart(turnId, stepIndex, kind);
          const completed = event.type.endsWith(".completed");
          const before = textPart(previous, turnId, stepIndex, kind)?.text ?? "";
          const current = textPart(data, turnId, stepIndex, kind)?.text ?? "";
          if (completed && !current.startsWith(before)) throw new Error("Completed content changed its streamed prefix. Reload the conversation to read the saved result.");
          const delta = completed ? current.slice(before.length) : event.type === "message.appended" ? event.data.messageDelta : event.type === "reasoning.appended" ? event.data.reasoningDelta : "";
          const id = kind === "text" ? message.id : `${message.id}:${stepIndex}:reasoning`;
          if (delta) yield kind === "text"
            ? { type: EventType.TEXT_MESSAGE_CONTENT, messageId: id, delta }
            : { type: EventType.REASONING_MESSAGE_CONTENT, messageId: id, delta };
          if (completed) {
            if (kind === "text") yield { type: EventType.TEXT_MESSAGE_END, messageId: id };
            else {
              yield { type: EventType.REASONING_MESSAGE_END, messageId: id };
              yield { type: EventType.REASONING_END, messageId: id };
            }
          }
        }
      }
      for (const [index, message] of data.messages.entries()) {
        const prior = previous.messages[index];
        const before = prior?.id === message.id ? prior : previous.messages.find(item => item.id === message.id);
        if (message === before) continue;
        for (const part of message.parts) {
          if (part.type !== "dynamic-tool") continue;
          if (before?.parts.find(item => item.type === "dynamic-tool" && item.toolCallId === part.toolCallId) === part) continue;
          yield* openTool(message.id, part);
          if (event.type === "action.input.appended" && event.data.callId === part.toolCallId) {
            yield { type: EventType.TOOL_CALL_ARGS, toolCallId: part.toolCallId, delta: event.data.inputTextDelta };
            continue;
          }
          yield { type: EventType.TOOL_CALL_ARGS, toolCallId: part.toolCallId, delta: "", metadata: { eve: part } };
          if (part.state !== "input-streaming") yield { type: EventType.TOOL_CALL_END, toolCallId: part.toolCallId, input: part.input };
          if (part.state === "output-available" || part.state === "output-error" || part.state === "output-denied") {
            yield { type: EventType.TOOL_CALL_RESULT, messageId: `${part.toolCallId}:result`, toolCallId: part.toolCallId,
              content: JSON.stringify(part.state === "output-error" ? part.errorText : part.output) ?? "null", role: "tool",
              metadata: { tanstack: { ...(part.state !== "output-available" ? { state: "output-error" } : {}) } },
            };
          }
        }
      }
      boundary = isEveResponseBoundary(event);
    }
    if (!boundary) throw new Error("Eve stream ended before a durable turn boundary.");
    const interrupts = eveQuestionInterrupts(data, runId);
    yield {
      type: EventType.RUN_FINISHED, threadId, runId, metadata: { tanstack: { finishReason: "stop" } },
      outcome: interrupts.length ? { type: "interrupt", interrupts } : { type: "success" },
    };
  } catch (error) {
    yield { type: EventType.RUN_ERROR, code: "EVE_STREAM_ERROR", message: error instanceof Error ? error.message : String(error), metadata: { tanstack: { threadId, runId } } };
  }
}

function messageSnapshot(data: EveMessageData): Extract<StreamChunk, { type: "MESSAGES_SNAPSHOT" }> {
  // The official serializer types an anchor's role as a union rather than a
  // discriminated union. Preserve its rich parts instead of converting again.
  return { type: EventType.MESSAGES_SNAPSHOT, messages: uiMessagesToWire(eveChatMessages(data.messages)) as Extract<StreamChunk, { type: "MESSAGES_SNAPSHOT" }>["messages"] };
}

/** Rebuild view-local interrupt bindings from Eve's authoritative projection. */
export function eveQuestionInterrupts(data: EveMessageData, runId: string) {
  return eveChatMessages(data.messages).flatMap(message => message.parts.flatMap(part => {
      if (part.type !== "tool-call") return [];
      const question = eveQuestion(part);
      if (!question || question.settled) return [];
      return [withInterruptBinding({
        id: question.request.requestId,
        reason: "generic",
        message: question.request.prompt,
        metadata: { eve: question.request },
      }, {
        v: 1,
        kind: "generic",
        interruptId: question.request.requestId,
        interruptedRunId: runId,
        generation: 0,
      })];
    }));
}
