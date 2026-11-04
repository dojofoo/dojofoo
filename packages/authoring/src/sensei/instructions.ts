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

/** Per session: the teaching style of the course's mode and the course's own DOJO.md. */
export function senseiCourseInstructions(input: { mode: keyof typeof styles; guidance: string }, read: ReadContract = shipped): string {
  const guidance = input.guidance.trim();
  return [read(styles[input.mode]).trim(), ...(guidance ? [`DOJO.md for this course:\n${guidance}`] : [])].join("\n\n");
}
