import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessAgent } from "@dojofoo/agent/harness";
import { createLocalSandbox } from "@dojofoo/agent/experimental/local";
import { agentAdapter } from "@dojofoo/agent/adapters";
import { isAgentId } from "@dojofoo/protocol";
import { learnerPrompt, parseLearnerAnswers, type LearnerDialogue, type LearnerQuestion } from "./learner.ts";

export type { LearnerDialogue, LearnerQuestion } from "./learner.ts";
type LearnerRequest = {
  dialogue: LearnerDialogue;
  source: string;
  harness: string;
  model: string;
  signal: AbortSignal;
};

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
  return parseLearnerAnswers(await runLearner(request, request.questions), request.questions);
}

async function runLearner({ dialogue, source, harness, model, signal }: LearnerRequest, questions?: LearnerQuestion[]): Promise<string> {
  if (!harness.trim() || !model.trim()) throw new Error("Select the learner harness and model explicitly");
  if (!isAgentId(harness)) throw new Error(`Unsupported coding agent: ${harness}`);
  signal.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), "dojo-learner-response-"));
  const { instructions, prompt } = learnerPrompt({ dialogue, source, questions });
  const input = { dialogue, source, ...(questions ? { questions } : {}) };
  await writeFile(join(directory, "input.json"), JSON.stringify({ harness, model, instructions, ...input }, null, 2));
  console.info(`Learner response evidence: ${directory}`);
  const agent = new HarnessAgent({
    id: "dojo-review-learner",
    harness: await agentAdapter(harness),
    model, instructions, activeTools: [],
    stopWhen: ({ steps }) => steps.length >= 1,
  });
  const abortSignal = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
  const sandboxSession = await createLocalSandbox(directory);
  let session: Awaited<ReturnType<typeof agent.createSession>> | undefined;
  try {
    session = await agent.createSession({ abortSignal, sandboxSession });
    const result = await agent.generate({ session, abortSignal, prompt });
    await writeFile(join(directory, "response.txt"), result.text);
    if (!result.text.trim()) throw new Error(`Learner returned no review answer; evidence: ${directory}`);
    return result.text.trim();
  } finally {
    try { await session?.destroy(); }
    finally { await sandboxSession.stop(); }
  }
}
