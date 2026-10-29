import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { HarnessAgent } from "@dojofoo/agent/harness";
import { createLocalSandbox } from "@dojofoo/agent/experimental/local";
import { z } from "zod";
import { authoringHarness } from "../eve/harness";
import { fixtureGeneratorInstructions } from "./prompts";

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

const instructions = fixtureGeneratorInstructions;

/** One isolated, tool-free model turn per lesson. These references stay outside
 * the course and are never supplied to the teaching agent as instructions.
 * Local execution is not an OS filesystem sandbox.
 */
export async function generateLearnerFixtures({ material, lessonIds, harness, model, signal }: {
  material: Record<string, string>;
  lessonIds: string[];
  harness: string;
  model: string;
  signal: AbortSignal;
}) {
  if (!harness.trim() || !model.trim()) throw new Error("Select the fixture harness and model explicitly");
  if (!lessonIds.length || lessonIds.length > 2 || new Set(lessonIds).size !== lessonIds.length) {
    throw new Error("Generate fixtures for one or two distinct lessons");
  }
  signal.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), "dojo-learner-fixtures-"));
  const fixtures: Record<string, LearnerFixture> = {};
  // A simulated learner must not quote or depend on private teacher guidance.
  // Keep tests for constructing/verifying code fixtures, not teaching notes.
  const learnerMaterial = Object.fromEntries(Object.entries(material).filter(([path]) =>
    !["SENSEI.md", "SENSEI.mdx", "production-teaching-policy.md"].includes(basename(path))));
  await writeFile(join(directory, "input.json"), JSON.stringify({ harness, model, lessonIds, material: learnerMaterial, instructions }, null, 2));
  const agent = new HarnessAgent({
    id: "dojo-learner-fixtures",
    harness: await authoringHarness({ ...process.env, DOJOFOO_HARNESS: harness }),
    model,
    activeTools: [],
    instructions,
    stopWhen: ({ steps }) => steps.length >= 1,
  });
  for (const [index, lessonId] of lessonIds.entries()) {
    const abortSignal = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
    const sandboxSession = await createLocalSandbox(directory);
    let session: Awaited<ReturnType<typeof agent.createSession>> | undefined;
    try {
      session = await agent.createSession({ abortSignal, sandboxSession });
      const result = await agent.generate({ session, abortSignal, prompt: JSON.stringify({ lessonId, completedBefore: lessonIds.slice(0, index), material: learnerMaterial }) });
      await writeFile(join(directory, `${index + 1}-response.txt`), result.text);
      const fixture = parseLearnerFixture(result.text);
      if (!fixture.uncertainty || !fixture.terminology) {
        throw new Error("Generated learner fixtures need lesson-specific uncertainty and terminology questions");
      }
      fixtures[lessonId] = fixture;
    } finally {
      try { await session?.destroy(); }
      finally { await sandboxSession.stop(); }
    }
  }
  const path = join(directory, "learner-fixtures.json");
  await writeFile(path, JSON.stringify(fixtures, null, 2));
  return { path, directory };
}
