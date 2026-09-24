import type { EveMessage, EveMessagePart } from "@dojofoo/agent/client";
import type { MessagePart, ToolCallPart, UIMessage } from "@tanstack/ai";

/** Render-only projection of Eve's official reducer output. Never a history store
 * or model prompt: Eve retains ownership of replay, input requests and answers.
 */
export function eveChatMessages(messages: readonly EveMessage[]): UIMessage[] {
  return messages.map(message => ({
    id: message.id,
    role: message.role,
    parts: message.parts.flatMap(part => projectPart(part)),
  }));
}

/** Read the original Eve question, not the model's raw tool arguments. */
export function eveQuestion(part: ToolCallPart) {
  const source = (part.metadata as { eve?: EveMessagePart } | undefined)?.eve;
  if (source?.type !== "dynamic-tool") return;
  const request = source.toolMetadata?.eve?.inputRequest;
  if (request?.kind !== "question") return;
  return {
    request,
    response: source.toolMetadata?.eve?.inputResponse,
    settled: source.state !== "approval-requested",
  };
}

const toolStates = {
  "input-streaming": "input-streaming",
  "input-available": "input-complete",
  "approval-requested": "approval-requested",
  "approval-responded": "approval-responded",
  "output-available": "complete",
  "output-error": "error",
  "output-denied": "error",
} as const satisfies Record<Extract<EveMessagePart, { type: "dynamic-tool" }>["state"], ToolCallPart["state"]>;

function projectPart(part: EveMessagePart): MessagePart[] {
  switch (part.type) {
    case "text":
      return [{ type: "text", content: part.text, metadata: { eve: part } }];
    case "reasoning":
      return [{ type: "thinking", content: part.text, stepId: part.stepIndex?.toString() }];
    case "step-start":
      return [];
    case "file":
      return part.url ? [{
        type: part.mediaType.startsWith("image/") ? "image" : part.mediaType.startsWith("audio/") ? "audio" : part.mediaType.startsWith("video/") ? "video" : "document",
        source: { type: "url", value: part.url, mimeType: part.mediaType },
        metadata: { eve: part },
      }] : [{ type: "text", content: part.filename ?? `Attachment (${part.mediaType})`, metadata: { eve: part } }];
    case "authorization":
      // Keep the structured challenge for a dedicated UI control. Display only
      // the public description; never turn an authorization into a model tool.
      return [{ type: "text", content: part.description, metadata: { eve: part } }];
    case "dynamic-tool":
      return [{
        type: "tool-call",
        id: part.toolCallId,
        name: part.toolName,
        arguments: part.state === "input-streaming" ? part.inputText : JSON.stringify(part.input) ?? "",
        input: part.input,
        state: part.state === "output-available" && part.partial ? "input-complete" : toolStates[part.state],
        ...(part.approval ? { approval: { id: part.approval.id, needsApproval: true, approved: part.approval.approved } } : {}),
        output: part.state === "output-error" ? part.errorText : part.output,
        // Retain request IDs, choices, responses, partial results and denial
        // distinctions. No guessing a user's answer from assistant prose.
        metadata: { eve: part },
      }];
  }
}
