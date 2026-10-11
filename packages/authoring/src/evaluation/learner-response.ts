import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessAgent } from "@dojofoo/agent/harness";
import { createLocalHarnessSandbox } from "@dojofoo/agent/experimental/local";
import { authoringHarness } from "../eve/harness";
import { learnerInstructions } from "./prompts";

export type LearnerDialogue = Array<{ role: "user" | "assistant"; content: string }>;

/** Respond to the actual review, not a prewritten answer to an assumed question.
 * Receives only public dialogue and the learner's own code: no teacher guidance,
 * judging criteria, hidden tests, or expected verdict.
 */
export async function respondAsLearner({ dialogue, source, harness, model, signal }: {
  dialogue: LearnerDialogue;
  source: string;
  harness: string;
  model: string;
  signal: AbortSignal;
}): Promise<string> {
  if (!harness.trim() || !model.trim()) throw new Error("Select the learner harness and model explicitly");
  const directory = await mkdtemp(join(tmpdir(), "dojo-learner-response-"));
  const instructions = learnerInstructions;
  const input = { dialogue, source };
  await writeFile(join(directory, "input.json"), JSON.stringify({ harness, model, instructions, ...input }, null, 2));
  const agent = new HarnessAgent({
    id: "dojo-review-learner",
    harness: authoringHarness({ ...process.env, DOJOFOO_HARNESS: harness }),
    model, instructions, activeTools: [],
    sandbox: createLocalHarnessSandbox(directory),
    stopWhen: ({ steps }) => steps.length >= 1,
  });
  const abortSignal = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
  const session = await agent.createSession({ abortSignal });
  try {
    const result = await agent.generate({ session, abortSignal, prompt: JSON.stringify(input) });
    await writeFile(join(directory, "response.txt"), result.text);
    if (!result.text.trim()) throw new Error(`Learner returned no review answer; evidence: ${directory}`);
    return result.text.trim();
  } finally {
    await session.destroy();
  }
}
