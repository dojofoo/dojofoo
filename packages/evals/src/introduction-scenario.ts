import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface Assertion {
  name: string;
  passed: boolean;
  evidence?: string;
}

export interface IntroductionScenario {
  course: string;
  courseSkill: string;
  instructions: string;
  lesson: string;
  platform: string;
  style: string;
  prompt: string;
  skill: string;
  solution: string;
}

export async function introductionScenario(): Promise<IntroductionScenario> {
  const workspace = resolve(import.meta.dirname, "../../..");
  const sourceCheckout = resolve(workspace, "../starter-kata");
  const courseRoot = process.env.DOJOFOO_STARTER_ROOT
    ? resolve(process.env.DOJOFOO_STARTER_ROOT)
    : existsSync(sourceCheckout)
      ? sourceCheckout
      : resolve(workspace, ".dojos/starter-kata");
  const [dojofoo, style, dojo, sensei, skill, courseSkill] = await Promise.all([
    readFile(
      resolve(workspace, "packages/agents/src/sensei/contracts/DOJOFOO.md"),
      "utf8"
    ),
    readFile(
      resolve(workspace, "packages/agents/src/sensei/contracts/KATAS.md"),
      "utf8"
    ),
    readFile(resolve(courseRoot, "DOJO.md"), "utf8"),
    readFile(resolve(courseRoot, "katas/002-validate-registration/SENSEI.md"), "utf8"),
    readFile(resolve(workspace, "packages/cli/skills/dojofoo/SKILL.md"), "utf8"),
    readFile(resolve(courseRoot, "skills/starter-sensei/SKILL.md"), "utf8"),
  ]);
  const solution = [
    "export type RegistrationResult =",
    "  | { ok: true; handle: string }",
    "  | { ok: false; reason: 'empty' | 'too-short' };",
    "",
    "export function validateRegistration(input: string): RegistrationResult {",
    "  throw new Error('Not implemented');",
    "}",
  ].join("\n");
  const context = {
    phase: "start",
    course: { id: "starter-kata" },
    lesson: {
      id: "002-validate-registration",
      title: "Validate Registration",
      objective: "Model validation as an explicit success-or-failure result.",
      state: "not-started",
    },
    learner: {
      file: { path: "solution.ts", language: "typescript", content: solution },
      latestCheck: null,
    },
  };
  return {
    course: dojo,
    courseSkill,
    instructions: [
      "<dojofoo>", dojofoo, "</dojofoo>",
      "<teaching-style>", style, "</teaching-style>",
      "<course>", dojo, "</course>",
      "<lesson>", sensei, "</lesson>",
    ].join("\n\n"),
    prompt: `<current_lesson_context>${JSON.stringify(context)}</current_lesson_context>\nBegin the lesson.`,
    skill,
    lesson: sensei,
    platform: dojofoo,
    style,
    solution,
  };
}

export function scoreIntroduction(text: string, toolNames: string[]): Assertion[] {
  const questionCount = (text.match(/\?/gu) ?? []).length;
  const lessonActions = toolNames.filter((name) => name.startsWith("dojo_") && name !== "dojo_ui_ask" && name !== "dojo_context");
  const contextRecovery = toolNames.filter((name) => name === "dojo_context");
  const contextDiscovery = toolNames.filter((name) => /^(?:glob|grep|list|read)$/u.test(name));
  return [
    { name: "produces learner-facing text", passed: text.length > 0 },
    { name: "does not mutate lesson state during introduction", passed: lessonActions.length === 0, evidence: lessonActions.join(", ") },
    { name: "does not recover supplied lesson context", passed: contextRecovery.length === 0, evidence: contextRecovery.join(", ") },
    { name: "uses supplied context without rediscovering lesson files", passed: contextDiscovery.length === 0, evidence: contextDiscovery.join(", ") },
    { name: "does not narrate internal machinery", passed: !/dojofoo|sensei\.md|dojo\.md|(?:load(?:ed)?|missing|unavailable|not installed|isn't installed)[^\n.]{0,40}skill|check(?:ing)? (?:the )?(?:current )?lesson state|protocol|harness|interactive fragment tools|capabilit(?:y|ies)/iu.test(text) },
    { name: "avoids a question barrage", passed: questionCount <= 2, evidence: `${questionCount} question marks` },
    { name: "does not provide pasteable implementation", passed: !/return\s*\{|=>/u.test(text) },
    { name: "gives the learner a concrete beginning", passed: /first|begin|start|consider|look|what|try/iu.test(text) },
  ];
}

export function printResult(harness: string, text: string, toolNames: string[], durationMs?: number): void {
  const assertions = scoreIntroduction(text, toolNames);
  process.stdout.write(`${JSON.stringify({
    scenario: "starter-kata/002/fresh-introduction",
    harness,
    model: process.env.DOJOFOO_EVAL_MODEL ?? "configured-default",
    text,
    toolNames,
    durationMs,
    score: assertions.filter((assertion) => assertion.passed).length / assertions.length,
    assertions,
  }, null, 2)}\n`);
  if (assertions.some((assertion) => !assertion.passed)) process.exitCode = 1;
}
