import { readFile, rm } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  createSession: vi.fn(),
  generate: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("@dojofoo/agent/harness", () => ({ HarnessAgent: class {
  constructor(settings: unknown) { mocks.settings(settings); }
  createSession = mocks.createSession;
  generate = mocks.generate;
} }));
vi.mock("@dojofoo/agent/experimental/local", () => ({ createLocalHarnessSandbox: (directory: string) => ({ directory }) }));
vi.mock("../eve/harness", () => ({ authoringHarness: () => ({}) }));

import { generateLearnerFixtures, parseLearnerFixture } from "./learner-fixtures";
import { answerAsLearner, respondAsLearner } from "./learner-response";

const fixture = {
  uncertainty: "What does a running value remember?",
  terminology: "What does initialization mean here?",
  misconception: "Empty means zero", wrong: "export const value = 0", solved: "export const value = undefined", review: "Why choose this empty case?",
};
const directories: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

it("rejects missing fields, identical implementations, and unstructured output", () => {
  expect(() => parseLearnerFixture('{}')).toThrow();
  expect(() => parseLearnerFixture(JSON.stringify({ ...fixture, wrong: fixture.solved }))).toThrow("must differ");
  expect(() => parseLearnerFixture('Here are your fixtures')).toThrow();
});

it("can replay old captured fixtures without changing their learner questions", () => {
  const { uncertainty, terminology, ...legacy } = fixture;
  expect(uncertainty).toBeTruthy();
  expect(terminology).toBeTruthy();
  expect(parseLearnerFixture(JSON.stringify(legacy))).toEqual(legacy);
});

it("requires question fields on new fixtures instead of silently using replay fallbacks", async () => {
  const { uncertainty, terminology, ...legacy } = fixture;
  mocks.createSession.mockResolvedValue({ destroy: mocks.destroy });
  mocks.generate.mockResolvedValue({ text: JSON.stringify(legacy) });
  await expect(generateLearnerFixtures({ material: {}, lessonIds: ["first"], harness: "pi", model: "chosen-model", signal: AbortSignal.timeout(5000) }))
    .rejects.toThrow("lesson-specific uncertainty and terminology");
  directories.push(mocks.settings.mock.calls[0][0].sandbox.directory);
  expect(mocks.generate).toHaveBeenCalledOnce();
  expect(mocks.destroy).toHaveBeenCalledOnce();
});

it("uses isolated sessions, disables tools, and records actual model output outside the course", async () => {
  mocks.createSession.mockImplementation(async () => ({ destroy: mocks.destroy }));
  mocks.generate.mockResolvedValue({ text: JSON.stringify(fixture) });
  const result = await generateLearnerFixtures({ material: {
    "DOJO.md": "Course", "src/first/SENSEI.md": "Private teacher strategy",
    "src/second/SENSEI.mdx": "Private presentation", "production-teaching-policy.md": "Private policy",
    "src/first/kata.ts": "Public scaffold",
  }, lessonIds: ["first", "second"], harness: "pi", model: "chosen-model", signal: AbortSignal.timeout(5000) });
  directories.push(result.directory);
  expect(mocks.settings.mock.calls[0][0]).toMatchObject({ activeTools: [], model: "chosen-model" });
  expect(mocks.createSession).toHaveBeenCalledTimes(2);
  expect(JSON.parse(mocks.generate.mock.calls[0][0].prompt)).toMatchObject({ lessonId: "first", completedBefore: [] });
  expect(JSON.parse(mocks.generate.mock.calls[1][0].prompt)).toMatchObject({ lessonId: "second", completedBefore: ["first"] });
  for (const [input] of mocks.generate.mock.calls) {
    expect(JSON.parse(input.prompt).material).toEqual({ "DOJO.md": "Course", "src/first/kata.ts": "Public scaffold" });
  }
  expect(JSON.parse(await readFile(`${result.directory}/input.json`, "utf8")).material)
    .toEqual({ "DOJO.md": "Course", "src/first/kata.ts": "Public scaffold" });
  expect(mocks.destroy).toHaveBeenCalledTimes(2);
  expect(JSON.parse(await readFile(result.path, "utf8"))).toEqual({ first: fixture, second: fixture });
  expect(await readFile(`${result.directory}/1-response.txt`, "utf8")).toBe(JSON.stringify(fixture));
});

it("destroys the session after invalid output without retrying or switching models", async () => {
  mocks.createSession.mockImplementation(async () => ({ destroy: mocks.destroy }));
  mocks.generate.mockResolvedValue({ text: "invalid" });
  await expect(generateLearnerFixtures({ material: {}, lessonIds: ["first"], harness: "pi", model: "chosen-model", signal: AbortSignal.timeout(5000) })).rejects.toThrow();
  directories.push(mocks.settings.mock.calls[0][0].sandbox.directory);
  expect(mocks.generate).toHaveBeenCalledOnce();
  expect(mocks.destroy).toHaveBeenCalledOnce();
});

it("answers the public review in isolation without private teaching material", async () => {
  mocks.createSession.mockResolvedValue({ destroy: mocks.destroy });
  mocks.generate.mockResolvedValue({ text: "The value would stay negative." });
  const dialogue = [{ role: "assistant" as const, content: "What changes on negative input?" }];
  const answer = await respondAsLearner({ dialogue, source: "Learner code", harness: "pi", model: "chosen-model", signal: AbortSignal.timeout(5000) });
  directories.push(mocks.settings.mock.calls[0][0].sandbox.directory);
  expect(answer).toBe("The value would stay negative.");
  expect(JSON.parse(mocks.generate.mock.calls[0][0].prompt)).toEqual({ dialogue, source: "Learner code" });
  expect(mocks.settings.mock.calls[0][0]).toMatchObject({ activeTools: [], model: "chosen-model" });
  expect(mocks.destroy).toHaveBeenCalledOnce();
});

it("retains an empty learner response as failure and destroys its session", async () => {
  mocks.createSession.mockResolvedValue({ destroy: mocks.destroy });
  mocks.generate.mockResolvedValue({ text: " " });
  await expect(respondAsLearner({ dialogue: [], source: "code", harness: "pi", model: "chosen-model", signal: AbortSignal.timeout(5000) })).rejects.toThrow("no review answer");
  directories.push(mocks.settings.mock.calls[0][0].sandbox.directory);
  expect(mocks.destroy).toHaveBeenCalledOnce();
});

const questions = [
  { id: "approach", title: "How would you like to proceed?", options: [{ title: "Try it" }, { title: "Explain the idea" }], allowOther: false },
  { id: "uncertainty", title: "What is unclear?", options: [], allowOther: true },
];

it("answers the actual question form using only public context and the selected model", async () => {
  mocks.createSession.mockResolvedValue({ destroy: mocks.destroy });
  const answers = { approach: ["Explain the idea"], uncertainty: ["I do not know what a callback is."] };
  mocks.generate.mockResolvedValue({ text: JSON.stringify(answers) });
  const dialogue = [{ role: "user" as const, content: "I am not sure where to start." }];
  expect(await answerAsLearner({ questions, dialogue, source: "Public learner code", harness: "pi", model: "chosen-model", signal: AbortSignal.timeout(5000) })).toEqual(answers);
  const settings = mocks.settings.mock.calls[0][0];
  directories.push(settings.sandbox.directory);
  expect(settings).toMatchObject({ activeTools: [], model: "chosen-model" });
  expect(JSON.parse(mocks.generate.mock.calls[0][0].prompt)).toEqual({ questions, dialogue, source: "Public learner code" });
  expect(settings.instructions).toContain("Do not choose an answer merely to appear knowledgeable");
  expect(mocks.generate).toHaveBeenCalledOnce();
  expect(mocks.destroy).toHaveBeenCalledOnce();
});

it.each([
  "prose, not JSON",
  JSON.stringify({ approach: ["Try it"] }),
  JSON.stringify({ approach: ["Guess"], uncertainty: ["Unclear"] }),
  JSON.stringify({ approach: ["Try it"], uncertainty: ["  "] }),
  JSON.stringify({ approach: ["Try it"], uncertainty: ["Unclear"], invented: ["extra"] }),
])("rejects invalid learner selections without retrying: %s", async text => {
  mocks.createSession.mockResolvedValue({ destroy: mocks.destroy });
  mocks.generate.mockResolvedValue({ text });
  await expect(answerAsLearner({ questions, dialogue: [], source: "code", harness: "pi", model: "chosen-model", signal: AbortSignal.timeout(5000) })).rejects.toThrow();
  directories.push(mocks.settings.mock.calls[0][0].sandbox.directory);
  expect(mocks.generate).toHaveBeenCalledOnce();
  expect(mocks.destroy).toHaveBeenCalledOnce();
});

it("rejects duplicate question IDs or cancellation before inference", async () => {
  const request = { questions, dialogue: [], source: "code", harness: "pi", model: "chosen-model", signal: AbortSignal.timeout(5000) };
  await expect(answerAsLearner({ ...request, questions: [questions[0]!, questions[0]!] })).rejects.toThrow("distinct IDs");
  await expect(answerAsLearner({ ...request, signal: AbortSignal.abort(new Error("Cancelled")) })).rejects.toThrow("Cancelled");
  expect(mocks.settings).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
});
