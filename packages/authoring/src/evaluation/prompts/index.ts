import { promptSection, promptSections, readPrompt, renderPrompt } from "../../prompts";
const boundary = readPrompt("evaluation/prompts/BOUNDARY.md");
const criteria = readPrompt("evaluation/prompts/CRITERIA.md");
const fixtureGenerator = readPrompt("evaluation/prompts/FIXTURE-GENERATOR.md");
const learner = readPrompt("evaluation/prompts/LEARNER.md");
const learnerScript = readPrompt("evaluation/prompts/LEARNER-SCRIPT.md");
const materialJudge = readPrompt("evaluation/prompts/MATERIAL-JUDGE.md");
const teachingJudge = readPrompt("evaluation/prompts/TEACHING-JUDGE.md");
const verdict = readPrompt("evaluation/prompts/VERDICT.md");

/** Bump when a judge, criterion or scripted learner line changes meaning.
 * Verdicts from different versions are not comparable. */
export const materialRubricVersion = "material-v6";
export const teachingRubricVersion = "sensei-chain-v7";

export const evaluationPrompts = { boundary, criteria, fixtureGenerator, learner, learnerScript, materialJudge, teachingJudge, verdict };

export const solutionBoundary = boundary.trim();
export const criteriaText = renderPrompt(criteria.replace(/^# .*\n+/u, ""), { boundary: solutionBoundary });
export const criterionSections = promptSections(criteriaText);
export const fixtureGeneratorInstructions = renderPrompt(fixtureGenerator);
export const learnerInstructions = renderPrompt(learner);

const script = promptSections(learnerScript);
export const scriptedLearner = (stage: "uncertainty" | "unfamiliar-terminology" | "frustration" | "independence") => promptSection(script, stage);

function judge(template: string, version: string, evidence: Record<string, string>, schema: object) {
  return renderPrompt(template, {
    version, criteria: criteriaText, verdict: verdict.trim(),
    schema: JSON.stringify(schema), evidence: JSON.stringify(evidence, null, 2),
  });
}

export const materialJudgePrompt = (evidence: Record<string, string>, schema: object) => judge(materialJudge, materialRubricVersion, evidence, schema);
export const teachingJudgePrompt = (evidence: Record<string, string>, schema: object) => judge(teachingJudge, teachingRubricVersion, evidence, schema);

/** Lets other suites (e.g. the authoring-chain judge) reuse the shared verdict rules. */
export const verdictRules = verdict.trim();
