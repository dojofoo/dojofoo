import { isCurrentTurnBoundaryEvent, type ClientSession, type MessageStreamEvent } from "@dojofoo/agent/client";

/** Eve can pause a turn for input without ending the containing session. */
export function isEveResponseBoundary(event: MessageStreamEvent): boolean {
  return isCurrentTurnBoundaryEvent(event) || (event.type === "turn.waiting" && event.data.on === "input");
}

/** Read from Eve's durable cursor without creating another session owner. */
export async function* resumeEveEvents(session: ClientSession, signal: AbortSignal, initialEvents: readonly MessageStreamEvent[] = []): AsyncGenerator<MessageStreamEvent> {
  signal.throwIfAborted();
  const tail = initialEvents.at(-1);
  if (tail && isEveResponseBoundary(tail)) {
    yield tail;
    return;
  }
  for await (const event of session.stream({ signal })) {
    yield event;
    if (isEveResponseBoundary(event)) return;
  }
}
