import { randomUUID } from "node:crypto";
import type {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext,
} from "@a2a-js/sdk/server";

/**
 * Echo executor — stub for the v1 plumbing test.
 *
 * Reads the user's text part(s), publishes a single agent message back
 * with `"You said: <text>"`, then closes the event bus.
 *
 * The real broker will inspect the targeted skill (echo / opencode /
 * agy / codex / …) and forward to the matching harness adapter,
 * relaying that adapter's stream as A2A events. That work lands in a
 * follow-up.
 */
export class EchoExecutor implements AgentExecutor {
  async cancelTask(_taskId: string, _eventBus: ExecutionEventBus): Promise<void> {
    // No long-running task in the echo path — nothing to cancel.
  }

  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    const userMessage = requestContext.userMessage;
    const userText = userMessage.parts
      .filter((p): p is { kind: "text"; text: string } => p.kind === "text")
      .map((p) => p.text)
      .join("\n");

    const replyText = userText
      ? `You said: ${userText}`
      : "(no text content received)";

    eventBus.publish({
      kind: "message",
      role: "agent",
      messageId: randomUUID(),
      contextId: userMessage.contextId,
      taskId: requestContext.task?.id,
      parts: [{ kind: "text", text: replyText }],
    });

    eventBus.finished();
  }
}
