import type { MultimodalContent } from "@tanstack/ai-client";

/** Browser-selected files travel in the normal chat message, independently of its mode. */
export async function chatMessageContent(text: string, files: File[]): Promise<string | MultimodalContent> {
  if (!files.length) return text;
  const attachments = await Promise.all(files.map(async file => {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error(`Could not read ${file.name}`));
      reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
      reader.readAsDataURL(file);
    });
    const type = file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : "document";
    return { type, source: { type: "data", value: data.slice(data.indexOf(",") + 1), mimeType: file.type || "application/octet-stream" }, metadata: { filename: file.name } } as const;
  }));
  return { content: [...(text ? [{ type: "text" as const, content: text }] : []), ...attachments] };
}
