import type { EveMessage, EveMessagePart } from "@dojofoo/agent/client";
import type { MessagePart, ToolCallPart, UIMessage } from "@tanstack/ai";
import { KYOSHI_START } from "./bootstrap";

type EveToolPart = Extract<EveMessagePart, { type: "tool" }>;
type EveInteractionPart = Extract<EveMessagePart, { type: "interaction" }>;

/** Eve's own messages (`useEveAgent`'s `messages`) in the chat's render model. Render only:
 * Eve keeps the history, the interactions and their answers.
 */
export function eveChatMessages(messages: readonly EveMessage[]): UIMessage[] {
  return messages.filter((message, index) => !(index === 0 && message.role === "user"
    && message.parts.length === 1 && message.parts[0]!.type === "text" && message.parts[0]!.text === KYOSHI_START)).map(message => ({
    id: message.id,
    role: message.role,
    parts: message.parts.flatMap(projectPart),
  }));
}

/** The Eve question a tool call (or a free question) carries, as Eve decided it. */
export function eveQuestion(part: ToolCallPart) {
  const source = (part.metadata as { eve?: EveMessagePart } | undefined)?.eve;
  const interaction = source?.type === "tool" ? source.interaction : source?.type === "interaction" ? source : undefined;
  if (interaction?.request.kind !== "question") return;
  const settled = interaction.status === "settled";
  return {
    interactionId: interaction.interactionId,
    request: interaction.request,
    answer: interaction.answer,
    settled,
    error: settled && interaction.outcome !== "accepted" && interaction.outcome !== "declined"
      ? interaction.reason ?? `This question was ${interaction.outcome}.` : undefined,
  };
}

const toolStates = {
  requested: "input-complete",
  approval: "approval-requested",
  running: "input-complete",
  blocked: "input-complete",
  completed: "complete",
  failed: "error",
  rejected: "error",
  cancelled: "error",
} as const satisfies Record<Exclude<EveToolPart["state"], "streaming">, ToolCallPart["state"]>;

function projectPart(part: EveMessagePart): MessagePart[] {
  switch (part.type) {
    case "text":
      return [{ type: "text", content: part.text, metadata: { eve: part } }];
    case "reasoning":
      return [{ type: "thinking", content: part.text, stepId: part.stepIndex?.toString() }];
    case "file":
      return part.url ? [{
        type: part.mediaType.startsWith("image/") ? "image" : part.mediaType.startsWith("audio/") ? "audio" : part.mediaType.startsWith("video/") ? "video" : "document",
        source: { type: "url", value: part.url, mimeType: part.mediaType },
        metadata: { eve: part },
      }] : [{ type: "text", content: part.filename ?? `Attachment (${part.mediaType})`, metadata: { eve: part } }];
    case "interaction":
      return [projectInteraction(part)];
    case "tool": {
      const approval = part.interaction?.request.kind === "approval" ? part.interaction : undefined;
      return [{
        type: "tool-call",
        id: part.callId,
        name: part.name,
        arguments: part.state === "streaming" ? part.inputText : JSON.stringify(part.input) ?? "",
        input: part.state === "streaming" ? undefined : part.input,
        state: part.state === "streaming" ? "input-streaming" : toolStates[part.state],
        ...(approval ? { approval: { id: approval.interactionId, needsApproval: true,
          approved: approval.outcome === "accepted" ? true : approval.outcome === "declined" ? false : undefined } } : {}),
        output: part.state === "streaming" ? undefined : part.error?.message ?? part.output,
        metadata: { eve: part },
      }];
    }
  }
}

/** A question no call carries renders as the question form; a sign-in shows its instructions. */
function projectInteraction(part: EveInteractionPart): MessagePart {
  if (part.request.kind === "question") {
    return { type: "tool-call", id: part.interactionId, name: "question", arguments: "", state: part.status === "settled" ? "complete" : "input-complete", metadata: { eve: part } };
  }
  return { type: "text", content: part.request.signIn?.instructions ?? part.request.prompt, metadata: { eve: part } };
}
