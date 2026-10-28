import { createDataUrlFilePart, parseInputResponses, type ClientSession } from "@dojofoo/agent/client";
import { chatParamsFromRequestBody, convertMessagesToModelMessages, type ContentPart } from "@tanstack/ai";
import { AgentApiError } from "./runtime";

export type AgentMessage = Parameters<ClientSession["send"]>[0];
export type InputResponses = ReturnType<typeof parseInputResponses>;

/** A run request (AG-UI `RunAgentInput`): the new user message, or answers to pending questions. */
export async function runInput(body: unknown): Promise<{ runId?: string; message?: AgentMessage; answers?: InputResponses; forwardedProps?: unknown }> {
  let input;
  try { input = await chatParamsFromRequestBody(body); }
  catch (cause) { throw new AgentApiError(400, "invalid_run", "The request is not a valid run.", { cause }); }
  if (input.resume !== undefined) return { runId: input.runId, answers: answers(input.resume), forwardedProps: input.forwardedProps };
  // The agent keeps the history; send only the new user turn, never replay the client's.
  const latest = convertMessagesToModelMessages(input.messages).at(-1);
  const content = latest?.role === "user" ? latest.content : undefined;
  const message = content == null ? undefined : agentMessage(content);
  if (!message || !(typeof message === "string" ? message.trim() : message.length)) {
    throw new AgentApiError(422, "message_required", "A run needs a user message or answers.");
  }
  return { runId: input.runId, message, forwardedProps: input.forwardedProps };
}

function answers(resume: unknown): InputResponses {
  try {
    if (!Array.isArray(resume) || resume.length === 0) throw new Error("Answers are required.");
    return parseInputResponses(resume.map(item => {
      if (!item || item.status !== "resolved") throw new Error("Only answered questions can resume a run; cancel the run to stop the agent.");
      return { ...item.payload, requestId: item.interruptId };
    }));
  } catch (error) {
    throw new AgentApiError(422, "invalid_answers", error instanceof Error ? error.message : String(error));
  }
}

/** Text and attachments as the agent receives them. */
export function agentMessage(content: string | ContentPart[]): AgentMessage {
  if (typeof content === "string") return content;
  return content.map(part => {
    if (part.type === "text") return { type: "text", text: part.content };
    const { source } = part;
    if (source.type === "file") throw new AgentApiError(422, "invalid_attachment", "A provider file handle cannot be sent to a coding agent. Attach the file itself.");
    if (!source.mimeType) throw new AgentApiError(422, "invalid_attachment", "The attachment's media type is required.");
    const metadata = part.metadata as { filename?: unknown } | undefined;
    const filename = typeof metadata?.filename === "string" ? metadata.filename : undefined;
    if (source.type === "url") return { type: "file", data: new URL(source.value), mediaType: source.mimeType, filename };
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(source.value), char => char.charCodeAt(0)); }
    catch { throw new AgentApiError(422, "invalid_attachment", "The attachment could not be decoded. Attach the file again."); }
    return createDataUrlFilePart({ bytes, mediaType: source.mimeType, filename });
  });
}
