import type { UIMessage } from "@tanstack/ai-client";

export type AnchoredChatEvent = {
  afterMessageId: string | null;
  message: UIMessage;
};

/** Merge host-owned events into the agent transcript without transferring ownership. */
export function projectChatTimeline(messages: readonly UIMessage[], events: AnchoredChatEvent[]): UIMessage[] {
  const projected: UIMessage[] = [];
  const remaining = new Map(events.map((event) => [event.message.id, event]));
  for (const message of messages) {
    projected.push(message);
    for (const event of events) {
      if (event.afterMessageId === message.id && remaining.delete(event.message.id)) projected.push(event.message);
    }
  }
  for (const event of events) {
    if (remaining.delete(event.message.id)) projected.push(event.message);
  }
  return projected;
}
