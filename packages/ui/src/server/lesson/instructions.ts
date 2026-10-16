import { promptSection, promptSections, renderPrompt } from "@dojofoo/authoring/prompts";
import platformTeaching from "./contracts/DOJOFOO.md?raw";
import kataTeaching from "./contracts/KATAS.md?raw";
import turnPrompts from "./contracts/TURNS.md?raw";
import { senseiFragmentIds } from "./sensei-content";

const styles: Record<string, string> = { katas: kataTeaching };

export function senseiTeachingPolicy(mode: string): string {
  return `${platformTeaching}\n\n${styles[mode] ?? ""}`;
}

/** Evaluation records the shared policy and hidden turn prompts. Future
 * event instructions are not injected into Sensei's opening context. */
export function senseiEvaluationPolicy(mode: string): string {
  return `${senseiTeachingPolicy(mode)}\n\n${turnPrompts}`;
}

const turns = promptSections(turnPrompts);

/** Hidden host message for a Sensei turn, from contracts/TURNS.md. */
export function senseiTurn(id: string, values?: Record<string, string>): string {
  return renderPrompt(promptSection(turns, id), values);
}

/** Runtime-independent private teaching contract.
 * Only the selected lesson is supplied. KYOSHI governs authoring, not teaching.
 */
export function senseiInstructions(input: { mode: string; dojo: string; sensei: string }): string {
  const fragments = senseiFragmentIds(input.sensei);
  return `${senseiTeachingPolicy(input.mode)}\n\nAvailable learner fragment IDs: ${fragments.length ? fragments.join(", ") : "none"}.\n\nDOJO.md for this course:\n${input.dojo}\n\nSensei lesson source:\n${input.sensei}`;
}
