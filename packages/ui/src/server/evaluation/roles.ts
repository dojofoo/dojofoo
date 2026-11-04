import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { OneShotRequest } from "@dojofoo/agent/one-shot";
import { judgePanel } from "@dojofoo/authoring/evaluation/judges";
import { learnerPrompt, parseLearnerAnswers, type LearnerDialogue, type LearnerQuestion } from "@dojofoo/authoring/evaluation/learner";
import { fixtureGeneratorInstructions } from "@dojofoo/authoring/evaluation/prompts";
import type { LearnerFixture } from "@dojofoo/authoring/evaluation/learner-fixtures";
import type { evaluateAuthoredCourse } from "@dojofoo/authoring/evaluation/run";
import type { AgentId } from "@dojofoo/protocol";
import { oneShotTimeLimitMs } from "./limits";

/** The trial's model calls besides Sensei: the fixtures, the simulated learner and the judges. */
export interface TrialRoles {
  fixtures(lessonIds: string[], material: Record<string, string>, signal: AbortSignal): Promise<Record<string, LearnerFixture>>;
  reply(dialogue: LearnerDialogue, source: string, signal: AbortSignal): Promise<string>;
  answer(questions: LearnerQuestion[], dialogue: LearnerDialogue, source: string, signal: AbortSignal): Promise<Record<string, string[]>>;
  judge: NonNullable<Parameters<typeof evaluateAuthoredCourse>[0]["judge"]>;
}

// Outside Vite's module graph, as agent-api.ts loads the persona runtimes: the adapters resolve bridge assets beside their package files
const load = createRequire(import.meta.url);

/** Every role is a one-shot on the course's agent and model (D10), its input and answer saved in the evidence folder. Each call works in
 *  `<stateDirectory>/evaluation/<call id>/` with an empty `scratch/`, removed afterwards. `oneShot` is replaceable for tests. */
export function oneShotRoles(options: { agent: AgentId; model?: string; evidenceRoot: string; stateDirectory: string;
  oneShot?: (request: OneShotRequest) => Promise<{ text: string }> }): TrialRoles {
  const { agent, model, evidenceRoot, stateDirectory } = options;
  const call = async (request: { instructions?: string; prompt: string; signal: AbortSignal; timeoutMs: number }) => {
    const oneShot = options.oneShot ?? (load("@dojofoo/agent/one-shot") as typeof import("@dojofoo/agent/one-shot")).oneShot;
    const directory = join(stateDirectory, "evaluation", randomUUID());
    await mkdir(join(directory, "scratch"), { recursive: true });
    try {
      return (await oneShot({ agent, ...(model ? { model } : {}), ...request, directory, stateDirectory })).text;
    } finally { await rm(directory, { recursive: true, force: true }); }
  };
  let learnerCalls = 0;
  const learner = async (input: { dialogue: LearnerDialogue; source: string; questions?: LearnerQuestion[] }, signal: AbortSignal) => {
    const n = ++learnerCalls;
    const { instructions, prompt } = learnerPrompt(input);
    await writeFile(join(evidenceRoot, `learner-${n}-input.json`), JSON.stringify({ agent, model, instructions, ...input }, null, 2));
    const text = await call({ instructions, prompt, signal, timeoutMs: oneShotTimeLimitMs.learner });
    await writeFile(join(evidenceRoot, `learner-${n}-response.txt`), text);
    if (!text.trim()) throw new Error(`Learner returned no answer; evidence: ${join(evidenceRoot, `learner-${n}-response.txt`)}`);
    return text.trim();
  };
  let panels = 0;
  return {
    async fixtures(lessonIds, material, signal) {
      // learner-fixtures still loads the harness adapters for generateLearnerFixtures
      const fixtures = load("@dojofoo/authoring/evaluation/learner-fixtures") as typeof import("@dojofoo/authoring/evaluation/learner-fixtures");
      const generated: Record<string, LearnerFixture> = {};
      for (const [index, lessonId] of lessonIds.entries()) {
        const prompt = fixtures.fixturePrompt({ lessonId, completedBefore: lessonIds.slice(0, index), material });
        await writeFile(join(evidenceRoot, `fixtures-${lessonId}-input.json`), JSON.stringify({ agent, model, instructions: fixtureGeneratorInstructions, prompt }, null, 2));
        const text = await call({ instructions: fixtureGeneratorInstructions, prompt, signal, timeoutMs: oneShotTimeLimitMs.fixtures });
        await writeFile(join(evidenceRoot, `fixtures-${lessonId}-response.txt`), text);
        generated[lessonId] = fixtures.parseGeneratedFixture(text);
      }
      await writeFile(join(evidenceRoot, "learner-fixtures.json"), JSON.stringify(generated, null, 2));
      return generated;
    },
    reply: (dialogue, source, signal) => learner({ dialogue, source }, signal),
    async answer(questions, dialogue, source, signal) {
      return parseLearnerAnswers(await learner({ dialogue, source, questions }, signal), questions);
    },
    // Two isolated judges per panel; a judge's prompt is whole, with its schema, so it is sent with no instructions
    judge(evidence, signal, buildPrompt) {
      const directory = join(evidenceRoot, `panel-${++panels}`);
      return judgePanel(evidence, signal, (_judge, prompt, signal) => call({ prompt, signal, timeoutMs: oneShotTimeLimitMs.judge }),
        { directory, ...(buildPrompt ? { buildPrompt } : {}) });
    },
  };
}
