import { promptSection, promptSections, readPrompt, renderPrompt } from "../../prompts";
import { solutionBoundary, verdictRules } from "./index";

/** Prompts for the developer eval suites in @dojofoo/evals. They live here so
 * Eve's eval bundle can resolve them through the linked authoring package. */
const autoevals = promptSections(readPrompt("evaluation/prompts/suites/AUTOEVALS.md"));
const briefs = promptSections(readPrompt("evaluation/prompts/suites/BRIEFS.md"));
const chainJudge = readPrompt("evaluation/prompts/suites/CHAIN-JUDGE.md");

/** Bump when CHAIN-JUDGE.md or a chain brief changes meaning. */
export const chainRubricVersion = "authoring-chain-v5";

export const brief = (id: string, values?: Record<string, string>) => renderPrompt(promptSection(briefs, id), values);
export const autoevalQuestion = (label: string) => promptSection(autoevals, label);

export function chainJudgePrompt(evidence: Record<string, string>, schema: object) {
  return renderPrompt(chainJudge, {
    version: chainRubricVersion, boundary: solutionBoundary, verdict: verdictRules,
    schema: JSON.stringify(schema), evidence: JSON.stringify(evidence),
  });
}
