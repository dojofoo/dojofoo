import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { HarnessAgent } from "@dojofoo/agent/harness";
import { createLocalSandbox } from "@dojofoo/agent/experimental/local";
import { authoringHarness } from "../eve/harness";
import { learnerInstructions } from "./prompts";

export type LearnerDialogue = Array<{ role: "user" | "assistant"; content: string }>;
export type LearnerQuestion = {
  id: string;
  title: string;
  options: Array<{ title: string }>;
  allowOther: boolean;
};
type LearnerRequest = {
  dialogue: LearnerDialogue;
  source: string;
  harness: string;
  model: string;
  signal: AbortSignal;
};
const answerSchema = z.record(z.string(), z.array(z.string().trim().min(1)).min(1));

/** Respond to the actual review, not a prewritten answer to an assumed question.
 * Receives only public dialogue and the learner's own code: no teacher guidance,
 * judging criteria, hidden tests, or expected verdict.
 */
export function respondAsLearner(request: LearnerRequest): Promise<string> {
  return runLearner(request);
}

/** Same learner and public context, with the actual UI questions. No answer key. */
export async function answerAsLearner(request: LearnerRequest & { questions: LearnerQuestion[] }): Promise<Record<string, string[]>> {
  if (!request.questions.length || new Set(request.questions.map(question => question.id)).size !== request.questions.length) {
    throw new Error("Learner questions must have distinct IDs");
  }
  const answers = answerSchema.parse(JSON.parse(await runLearner(request, request.questions)));
  if (Object.keys(answers).length !== request.questions.length) throw new Error("Learner must answer exactly the supplied questions");
  for (const question of request.questions) {
    const values = answers[question.id];
    if (!values || (!question.allowOther && values.some(value => !question.options.some(option => option.title === value)))) {
      throw new Error(`Invalid learner selection for ${question.id}`);
    }
  }
  return answers;
}

async function runLearner({ dialogue, source, harness, model, signal }: LearnerRequest, questions?: LearnerQuestion[]): Promise<string> {
  if (!harness.trim() || !model.trim()) throw new Error("Select the learner harness and model explicitly");
  signal.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), "dojo-learner-response-"));
  const format = questions
    ? 'Answer the supplied questions. Return only a JSON object mapping each question ID to an array of selected option titles, or your own answer when allowOther is true. Do not choose an answer merely to appear knowledgeable.'
    : "Return only your reply.";
  const instructions = `${learnerInstructions.trim()}\n\n${format}`;
  const input = { dialogue, source, ...(questions ? { questions } : {}) };
  await writeFile(join(directory, "input.json"), JSON.stringify({ harness, model, instructions, ...input }, null, 2));
  console.info(`Learner response evidence: ${directory}`);
  const agent = new HarnessAgent({
    id: "dojo-review-learner",
    harness: await authoringHarness({ ...process.env, DOJOFOO_HARNESS: harness }),
    model, instructions, activeTools: [],
    stopWhen: ({ steps }) => steps.length >= 1,
  });
  const abortSignal = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
  const sandboxSession = await createLocalSandbox(directory);
  let session: Awaited<ReturnType<typeof agent.createSession>> | undefined;
  try {
    session = await agent.createSession({ abortSignal, sandboxSession });
    const result = await agent.generate({ session, abortSignal, prompt: JSON.stringify(input) });
    await writeFile(join(directory, "response.txt"), result.text);
    if (!result.text.trim()) throw new Error(`Learner returned no review answer; evidence: ${directory}`);
    return result.text.trim();
  } finally {
    try { await session?.destroy(); }
    finally { await sandboxSession.stop(); }
  }
}
