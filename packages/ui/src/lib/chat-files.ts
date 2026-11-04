import type { MessageContent } from "@dojofoo/harness/client";

/** Browser-selected files travel in the agent's own message, beside its text. */
export async function chatMessageContent(text: string, files: File[]): Promise<MessageContent> {
  if (!files.length) return text;
  const attachments = await Promise.all(files.map(async file => ({
    type: "file" as const, data: new Uint8Array(await file.arrayBuffer()), mediaType: file.type || "application/octet-stream", filename: file.name,
  })));
  return [...(text ? [{ type: "text" as const, text }] : []), ...attachments];
}
