import { expect, it } from "vitest";
import { learnerPrompt, parseLearnerAnswers } from "./learner";
import { learnerInstructions } from "./prompts";

const questions = [
  { id: "approach", title: "How would you like to proceed?", options: [{ title: "Try it" }, { title: "Explain the idea" }], allowOther: false },
  { id: "uncertainty", title: "What is unclear?", options: [], allowOther: true },
];

it("a reply prompt carries only the public dialogue and the learner's code", () => {
  const dialogue = [{ role: "assistant" as const, content: "What changes on negative input?" }];
  const { instructions, prompt } = learnerPrompt({ dialogue, source: "Learner code" });
  expect(JSON.parse(prompt)).toEqual({ dialogue, source: "Learner code" });
  expect(instructions).toBe(`${learnerInstructions.trim()}\n\nReturn only your reply.`);
  expect(`${instructions}${prompt}`).not.toMatch(/SENSEI|production-teaching-policy/u);
});

it("a question prompt carries the actual questions and no answer key", () => {
  const dialogue = [{ role: "user" as const, content: "I am not sure where to start." }];
  const { instructions, prompt } = learnerPrompt({ dialogue, source: "Public learner code", questions });
  expect(JSON.parse(prompt)).toEqual({ dialogue, source: "Public learner code", questions });
  expect(instructions).toContain("Do not choose an answer merely to appear knowledgeable");
});

it("accepts answers to exactly the supplied questions with offered options, or free text where allowed", () => {
  const answers = { approach: ["Explain the idea"], uncertainty: ["I do not know what a callback is."] };
  expect(parseLearnerAnswers(JSON.stringify(answers), questions)).toEqual(answers);
});

it.each([
  "prose, not JSON",
  JSON.stringify({ approach: ["Try it"] }),
  JSON.stringify({ approach: ["Guess"], uncertainty: ["Unclear"] }),
  JSON.stringify({ approach: ["Try it"], uncertainty: ["  "] }),
  JSON.stringify({ approach: ["Try it"], uncertainty: [] }),
  JSON.stringify({ approach: ["Try it"], uncertainty: ["Unclear"], invented: ["extra"] }),
])("rejects invalid learner selections: %s", text => {
  expect(() => parseLearnerAnswers(text, questions)).toThrow();
});

it("rejects duplicate question IDs", () => {
  expect(() => parseLearnerAnswers("{}", [questions[0]!, questions[0]!])).toThrow("distinct IDs");
});
