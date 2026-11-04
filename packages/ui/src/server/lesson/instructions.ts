import { promptSection, promptSections, readPrompt, renderPrompt } from "@dojofoo/authoring/prompts";

const turns = promptSections(readPrompt("sensei/contracts/TURNS.md"));

/** Hidden host message for a Sensei turn, from @dojofoo/authoring's sensei/contracts/TURNS.md. */
export function senseiTurn(id: string, values?: Record<string, string>): string {
  return renderPrompt(promptSection(turns, id), values);
}
