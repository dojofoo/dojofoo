import { createHash } from "node:crypto";
import type { UIMessage } from "@tanstack/ai-client";
import type { LearnerEvidenceExcerpt } from "@dojofoo/protocol";

const maxExcerpts = 8;
const maxCharacters = 400;
const key = (entry: LearnerEvidenceExcerpt) => `${entry.source.sessionId}:${entry.source.messageId}`;

/** Bounded source excerpts, never model-written assertions about the learner. */
export function retainLearnerEvidence(previous: LearnerEvidenceExcerpt[], messages: UIMessage[], lessonId: string, sessionId: string): LearnerEvidenceExcerpt[] {
  const recent = messages.filter(message => message.role === "user" || message.role === "assistant")
    .map(message => {
      const text = message.parts.flatMap(part => part.type === "text" ? [part.content] : []).join("\n").trim();
      if (!text) return undefined;
      return {
        kind: "transcript-excerpt" as const,
        role: message.role as "user" | "assistant",
        text: text.slice(0, maxCharacters),
        truncated: text.length > maxCharacters,
        source: { lessonId, sessionId, messageId: message.id, sha256: createHash("sha256").update(text).digest("hex") },
      };
    }).filter((entry): entry is LearnerEvidenceExcerpt => entry !== undefined).slice(-maxExcerpts);
  const entries = new Map(previous.map(entry => [key(entry), entry]));
  for (const entry of recent) entries.set(key(entry), entry);
  return [...entries.values()].slice(-maxExcerpts);
}

export function lessonEvidence(current: LearnerEvidenceExcerpt[], previous: LearnerEvidenceExcerpt[] = []): LearnerEvidenceExcerpt[] {
  return [...previous.slice(-4), ...current.slice(-4)];
}
