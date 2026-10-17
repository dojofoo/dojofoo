import { promptSection, promptSections, readPrompt, renderPrompt } from "../../prompts";
import { criteriaText, verdictRules } from "./index";

/** Prompts for the developer eval suites in @dojofoo/evals. They live here so
 * Eve's eval bundle can resolve them through the linked authoring package. */
const autoevals = promptSections(readPrompt("evaluation/prompts/suites/AUTOEVALS.md"));
const briefs = promptSections(readPrompt("evaluation/prompts/suites/BRIEFS.md"));
const chainJudge = readPrompt("evaluation/prompts/suites/CHAIN-JUDGE.md");

/** Bump when the judge, shared boundary or a chain brief changes meaning. */
export const chainRubricVersion = "authoring-chain-v7";

export const brief = (id: string, values?: Record<string, string>) => renderPrompt(promptSection(briefs, id), values);
export const autoevalQuestion = (label: string) => promptSection(autoevals, label);

export function chainJudgePrompt(evidence: Record<string, string>, schema: object) {
  return renderPrompt(chainJudge, {
    version: chainRubricVersion, criteria: criteriaText, verdict: verdictRules,
    schema: JSON.stringify(schema), evidence: JSON.stringify(evidence),
  });
}
