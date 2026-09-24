import {
  defaultMessageReducer,
  isCurrentTurnBoundaryEvent,
  isTurnFailureEvent,
  type EveMessageData,
  type MessageStreamEvent,
} from "@dojofoo/agent/client";
import { EventType, uiMessagesToWire, withInterruptBinding, type StreamChunk } from "@tanstack/ai";
import { eveChatMessages, eveQuestion } from "./messages";

/** Consume a public Eve MessageResponse. Seed with the projection corresponding
 * to its saved cursor; neither this function nor the UI stores native history.
 * Standard snapshots retain rich tool/question state using TanStack's serializer.
 */
export async function* streamEveAsAgUi({ events, initial, threadId, runId }: {
  events: AsyncIterable<MessageStreamEvent>;
  initial: EveMessageData;
  threadId: string;
  runId: string;
}): AsyncGenerator<StreamChunk> {
  const reducer = defaultMessageReducer();
  let data = initial;
  let boundary = false;
  yield { type: EventType.RUN_STARTED, threadId, runId };
  if (data.messages.length) yield messageSnapshot(data);
  try {
    for await (const event of events) {
      if (isTurnFailureEvent(event)) {
        yield { type: EventType.RUN_ERROR, code: event.data.code, message: event.data.message };
        return;
      }
      const next = reducer.reduce(data, event);
      if (next !== data) {
        data = next;
        yield messageSnapshot(data);
      }
      boundary = isCurrentTurnBoundaryEvent(event);
    }
    if (!boundary) throw new Error("Eve stream ended before a durable turn boundary.");
    const interrupts = eveQuestionInterrupts(data, runId);
    yield {
      type: EventType.RUN_FINISHED, threadId, runId, finishReason: "stop",
      outcome: interrupts.length ? { type: "interrupt", interrupts } : { type: "success" },
    };
  } catch (error) {
    yield { type: EventType.RUN_ERROR, code: "EVE_STREAM_ERROR", message: error instanceof Error ? error.message : String(error) };
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
