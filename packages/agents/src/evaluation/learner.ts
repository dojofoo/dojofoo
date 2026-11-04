import { z } from "zod";
import { learnerInstructions } from "./prompts";

export type LearnerDialogue = Array<{ role: "user" | "assistant"; content: string }>;
export type LearnerQuestion = {
  id: string;
  title: string;
  options: Array<{ title: string }>;
  allowOther: boolean;
};
const answerSchema = z.record(z.string(), z.array(z.string().trim().min(1)).min(1));

/** The simulated learner's call: only public dialogue and the learner's own code, never teacher guidance, judging criteria,
 *  hidden tests or the expected verdict. With `questions`, the actual UI questions and no answer key. */
export function learnerPrompt(input: { dialogue: LearnerDialogue; source: string; questions?: LearnerQuestion[] }): { instructions: string; prompt: string } {
  const format = input.questions
    ? 'Answer the supplied questions. Return only a JSON object mapping each question ID to an array of selected option titles, or your own answer when allowOther is true. Do not choose an answer merely to appear knowledgeable.'
    : "Return only your reply.";
  return {
    instructions: `${learnerInstructions.trim()}\n\n${format}`,
    prompt: JSON.stringify({ dialogue: input.dialogue, source: input.source, ...(input.questions ? { questions: input.questions } : {}) }),
  };
}

/** The learner's answers: exactly the supplied question ids, each an offered option unless the question allows another. */
export function parseLearnerAnswers(text: string, questions: LearnerQuestion[]): Record<string, string[]> {
  if (!questions.length || new Set(questions.map(question => question.id)).size !== questions.length) {
    throw new Error("Learner questions must have distinct IDs");
  }
  const answers = answerSchema.parse(JSON.parse(text));
  if (Object.keys(answers).length !== questions.length) throw new Error("Learner must answer exactly the supplied questions");
  for (const question of questions) {
    const values = answers[question.id];
    if (!values || (!question.allowOther && values.some(value => !question.options.some(option => option.title === value)))) {
      throw new Error(`Invalid learner selection for ${question.id}`);
    }
  }
  return answers;
}
