import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { transcriptOf } from "@dojofoo/harness/client";
import type { SessionRecord } from "@dojofoo/harness/api";
import { isTaggedTurn, type LearnerEvidenceExcerpt } from "@dojofoo/protocol";
import type { UIMessage } from "@tanstack/ai-client";
import { retainLearnerEvidence } from "../lesson/learner-evidence";

type EvidenceFile = { version: 1; entries: Record<string, LearnerEvidenceExcerpt[]> };
type Events = Parameters<typeof transcriptOf>[0];

/** `<workspace>/.dojo/learner-evidence.json`, keyed `<courseId>` or `<courseId>/<lessonId>`. Host switches and session ends never touch it. */
const file = (path: string) => join(path, ".dojo", "learner-evidence.json");
const key = (courseId: string, lessonId?: string) => lessonId ? `${courseId}/${lessonId}` : courseId;

async function readEvidence(path: string): Promise<EvidenceFile> {
  try {
    const parsed = JSON.parse(await readFile(file(path), "utf8")) as Partial<EvidenceFile>;
    return { version: 1, entries: parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, entries: {} };
    throw error;
  }
}

/** The excerpts a new conversation for this page key is seeded with. */
export async function learnerEvidence(path: string, courseId: string, lessonId?: string): Promise<LearnerEvidenceExcerpt[]> {
  return (await readEvidence(path)).entries[key(courseId, lessonId)] ?? [];
}

/** Every excerpt of a course, its lessons' included: the sources a kata observation may cite (decision 12). */
export async function courseEvidence(path: string, courseId: string): Promise<LearnerEvidenceExcerpt[]> {
  return Object.entries((await readEvidence(path)).entries).filter(([entry]) => entry === courseId || entry.startsWith(`${courseId}/`)).flatMap(([, excerpts]) => excerpts);
}

let writing: Promise<unknown> = Promise.resolve();

/** At a Sensei turn.settled: the whole current conversation, without tagged turns, kept within retainLearnerEvidence's bounds.
 *  Each message id is its absolute position in the conversation, so one session never reuses an id for another message. */
export function captureLearnerEvidence(path: string, record: Pick<SessionRecord, "id" | "courseId" | "lessonId">, events: Events): Promise<void> {
  if (!record.courseId) return Promise.resolve();
  const courseId = record.courseId;
  const messages: UIMessage[] = transcriptOf(events).messages.flatMap((message, index) => isTaggedTurn(message.text.trimStart()) ? []
    : [{ id: `transcript-${index}`, role: message.role, parts: [{ type: "text" as const, content: message.text }] }]);
  const write = writing.then(async () => {
    const evidence = await readEvidence(path);
    const entry = key(courseId, record.lessonId);
    evidence.entries[entry] = retainLearnerEvidence(evidence.entries[entry] ?? [], messages, record.lessonId ?? courseId, record.id);
    await mkdir(dirname(file(path)), { recursive: true });
    const temporary = `${file(path)}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`);
    await rename(temporary, file(path));
  });
  writing = write.catch(() => {});
  return write;
}
