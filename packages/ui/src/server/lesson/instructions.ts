import platformTeaching from "./contracts/DOJOFOO.md?raw";
import kataTeaching from "./contracts/KATAS.md?raw";
import { senseiFragmentIds } from "./sensei-content";

/** Runtime-independent private teaching contract.
 * Only the selected lesson is supplied. KYOSHI governs authoring, not teaching.
 */
export function senseiInstructions(input: { mode: string; dojo: string; sensei: string }): string {
  const style = input.mode === "katas" ? kataTeaching : "";
  const fragments = senseiFragmentIds(input.sensei);
  return `${platformTeaching}\n\n${style}\n\nAvailable learner fragment IDs: ${fragments.length ? fragments.join(", ") : "none"}.\n\nDOJO.md for this course:\n${input.dojo}\n\nSensei lesson source:\n${input.sensei}`;
}
