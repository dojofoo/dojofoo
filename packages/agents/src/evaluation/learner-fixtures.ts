import { basename } from "node:path";
import { z } from "zod";

const fixtureSchema = z.object({
  // Older recorded fixtures remain replayable. New generations must include
  // both lesson-specific questions (checked below before returning them).
  uncertainty: z.string().trim().min(1).optional(),
  terminology: z.string().trim().min(1).optional(),
  misconception: z.string().trim().min(1),
  wrong: z.string().trim().min(1),
  solved: z.string().trim().min(1),
  review: z.string().trim().min(1),
}).strict();

export type LearnerFixture = z.infer<typeof fixtureSchema>;

export function parseLearnerFixture(text: string): LearnerFixture {
  const fixture = fixtureSchema.parse(JSON.parse(text));
  if (fixture.wrong === fixture.solved) {
    throw new Error("Learner's incorrect and solved implementations must differ");
  }
  return fixture;
}

/** parseLearnerFixture, plus the lesson-specific uncertainty and terminology questions a new generation must have. */
export function parseGeneratedFixture(text: string): LearnerFixture {
  const fixture = parseLearnerFixture(text);
  if (!fixture.uncertainty || !fixture.terminology) {
    throw new Error("Generated learner fixtures need lesson-specific uncertainty and terminology questions");
  }
  return fixture;
}

/** A simulated learner must not quote or depend on private teacher guidance.
 *  Keep tests for constructing/verifying code fixtures, not teaching notes. */
export function learnerMaterial(material: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(material).filter(([path]) =>
    !["SENSEI.md", "SENSEI.mdx", "production-teaching-policy.md"].includes(basename(path))));
}

/** The fixture generator's prompt for one lesson, over learnerMaterial of the course files. */
export function fixturePrompt(input: { lessonId: string; completedBefore: string[]; material: Record<string, string> }): string {
  return JSON.stringify({ lessonId: input.lessonId, completedBefore: input.completedBefore, material: learnerMaterial(input.material) });
}
