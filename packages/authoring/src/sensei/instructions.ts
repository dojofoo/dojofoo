import { readPrompt } from "../prompts.ts";

export type SenseiContract = "DOJOFOO.md" | "NATIVE.md" | "KATAS.md" | "INTERACTIVE.md";
/** Reads one of Sensei's contracts. The prepared server embeds them at build time (agents/sensei/contracts.ts), because its
 *  bundle has no @dojofoo/authoring to resolve at run time; Node callers read the shipped files. */
export type ReadContract = (name: SenseiContract) => string;
const shipped: ReadContract = name => readPrompt(`sensei/contracts/${name}`);
const styles = { katas: "KATAS.md", interactive: "INTERACTIVE.md" } as const;

/** The persona's static instructions: the platform policy and the native-tool rule. */
export function senseiPersonaInstructions(read: ReadContract = shipped): string {
  return [read("DOJOFOO.md").trim(), read("NATIVE.md").trim()].join("\n\n");
}

/** Per session: the teaching style of the course's mode and the course's own DOJO.md; for a kata lesson also its fragment ids and its
 *  SENSEI.md, as the ACP lesson instructions carried them (`packages/ui/src/server/lesson/instructions.ts`). */
export function senseiCourseInstructions(input: { mode: keyof typeof styles; guidance: string; lesson?: { source: string; fragmentIds: string[] } }, read: ReadContract = shipped): string {
  const guidance = input.guidance.trim();
  const lesson = input.lesson ? [`Available learner fragment IDs: ${input.lesson.fragmentIds.length ? input.lesson.fragmentIds.join(", ") : "none"}.`,
    `Sensei lesson source:\n${input.lesson.source}`] : [];
  return [read(styles[input.mode]).trim(), ...(guidance ? [`DOJO.md for this course:\n${guidance}`] : []), ...lesson].join("\n\n");
}
