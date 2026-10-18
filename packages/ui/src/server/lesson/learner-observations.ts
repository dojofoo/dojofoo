import { createHash } from "node:crypto";
import { z } from "zod";
import type { LearnerEvidenceExcerpt, LearnerObservation } from "@dojofoo/protocol";

const inputSchema = z.object({
  category: z.enum(["uncertainty", "understanding", "misconception", "support", "transfer"]),
  interpretation: z.string().trim().min(1).max(240),
  status: z.enum(["active", "resolved"]),
  source: z.object({ sessionId: z.string().min(1), messageId: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
  replaces: z.string().min(1).optional(),
}).strict();

/** Validate provenance, not semantic truth. Every saved claim stays an interpretation. */
export function recordLearnerObservation(previous: LearnerObservation[], input: unknown, sources: LearnerEvidenceExcerpt[]): { observation: LearnerObservation; observations: LearnerObservation[] } {
  const note = inputSchema.parse(input);
  const evidence = sources.find(entry => Object.entries(note.source).every(([key, value]) => entry.source[key as keyof typeof note.source] === value));
  if (!evidence) throw new Error("Learning note source is not available in this course's retained evidence");
  const expectedRole = note.category === "support" ? "assistant" : "user";
  if (evidence.role !== expectedRole) throw new Error(`${note.category} needs a ${expectedRole} message, not the other speaker's claim`);
  if (note.replaces && !previous.some(entry => entry.id === note.replaces)) throw new Error("The learning note to replace does not exist in this course");
  const observation: LearnerObservation = {
    id: createHash("sha256").update(JSON.stringify([note.category, note.interpretation, note.status, note.source])).digest("hex"),
    category: note.category, interpretation: note.interpretation, status: note.status,
    evidence: structuredClone(evidence),
  };
  const observations = previous.filter(entry => entry.id !== note.replaces && entry.id !== observation.id);
  observations.push(observation);
  return { observation, observations: observations.slice(-24) };
}
