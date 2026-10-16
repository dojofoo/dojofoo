import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { judgeMaterial } from "@dojofoo/authoring/evaluation/judges";
import { teachingJudgePrompt } from "@dojofoo/authoring/evaluation/teaching-rubric";
import { readMaterial } from "@dojofoo/authoring/evaluation/material";
import { runAuthoringHandoff } from "./authoring-handoff";
import type { AcpStreamPart } from "./codex-client";

afterEach(() => vi.unstubAllEnvs());

// Explicit opt-in: three production teacher turns and one judge pair. The
// course is supplied by the caller, not newly authored for this test.
it.runIf(process.env.DOJOFOO_EVAL_FOCUSED === "1")(
  "teaches a missing running-state principle using actual authored material",
  async () => {
    const root = process.env.DOJOFOO_HANDOFF_COURSE;
    const lessonId = process.env.DOJOFOO_EVAL_LESSON_ID;
    if (!root || !lessonId) throw new Error("Select a saved largest-number course and lesson before spending usage");
    const original = await readMaterial(root);
    const template = original[`src/${lessonId}/kata.ts`];
    expect(template, "This scenario requires the authored largest(numbers) kata").toMatch(/export function largest\(numbers: number\[\]\)/u);
    vi.stubEnv("DOJOFOO_EVALUATION_WORKER", "1");
    vi.stubEnv("DOJOFOO_HOME", process.env.DOJOFOO_HOME);
    vi.stubEnv("PORT", process.env.PORT);
    const directory = await runAuthoringHandoff(AbortSignal.timeout(300_000), [lessonId], {
      turns: [
        { message: "I know arrays and loops, but I haven't used a running value before. What job does it do?" },
        {
          code: "export function largest(numbers: number[]): number | undefined {\n  if (numbers.length === 0) return undefined;\n  let best = 0;\n  for (const number of numbers) {\n    if (number > best) best = number;\n  }\n  return best;\n}\n",
          message: "I traced my attempt with negative numbers. None of them beat my starting 0. I understand why it fails, but I don't know another way to choose a starting value.",
        },
      ],
    });
    console.info(`Focused production teaching: ${directory}`);
    expect(await readMaterial(root)).toEqual(original);
    const recorded: Array<{ stage?: string; deterministicLifecycle?: string; parts?: AcpStreamPart[] }> =
      JSON.parse(await readFile(join(directory, "evidence.json"), "utf8"));
    expect(recorded.at(-1)).toEqual({ deterministicLifecycle: "not-evaluated" });
    const turns = recorded.filter(row => row.stage);
    expect(turns.map(row => row.stage)).toEqual(["introduction", "focused-1", "focused-2"]);
    for (const turn of turns) {
      expect(turn.parts?.some(part => part.type === "text-delta" && part.delta.trim()),
        `${turn.stage} must produce learner-visible teaching before paid judging`).toBe(true);
    }
    const evidence = {
      scope: "Introduction and two learner turns only. This cannot establish review, completion, transfer, or a whole-lesson pass.",
      context: "The learner already knows variables, functions, arrays, loops and comparisons. They do not know running state or input-based initialization. The second learner turn supplies their nearly correct code.",
      transcript: JSON.stringify(turns.map(row => ({
        ...row, parts: row.parts?.filter(part => !part.type.startsWith("reasoning-")),
      }))),
    };
    const results = await judgeMaterial(evidence, AbortSignal.timeout(210_000), teachingJudgePrompt);
    await writeFile(join(directory, "focused-judgments.json"), JSON.stringify(results, null, 2));
    for (const result of results) {
      for (const id of ["engagement", "learner-grounding", "adaptive-instruction", "solution-withholding"]) {
        const criterion = result.verdict.criteria.find(value => value.id === id);
        expect(criterion?.pass, `${result.judge}/${id}: ${criterion?.evidence}; ${directory}`).toBe(true);
      }
      expect(result.verdict.overall, "A focused trial is not whole-lesson acceptance").not.toBe("pass");
    }
  },
  540_000,
);
