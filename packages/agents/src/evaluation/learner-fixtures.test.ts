import { expect, it } from "vitest";
import { fixturePrompt, parseGeneratedFixture, parseLearnerFixture } from "./learner-fixtures";

const fixture = {
  uncertainty: "What does a running value remember?",
  terminology: "What does initialization mean here?",
  misconception: "Empty means zero", wrong: "export const value = 0", solved: "export const value = undefined", review: "Why choose this empty case?",
};

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

it("fixturePrompt leaves out SENSEI and the policy", () => {
  const prompt = JSON.parse(fixturePrompt({ lessonId: "second", completedBefore: ["first"], material: {
    "DOJO.md": "Course", "src/first/SENSEI.md": "Private teacher strategy", "src/second/SENSEI.mdx": "Private presentation",
    "production-teaching-policy.md": "Private policy", "src/second/kata.ts": "Public scaffold",
  } }));
  expect(prompt).toEqual({ lessonId: "second", completedBefore: ["first"], material: { "DOJO.md": "Course", "src/second/kata.ts": "Public scaffold" } });
});

it("parseGeneratedFixture requires the uncertainty and terminology questions", () => {
  expect(parseGeneratedFixture(JSON.stringify(fixture))).toEqual(fixture);
  const { uncertainty: _uncertainty, ...withoutUncertainty } = fixture;
  const { terminology: _terminology, ...withoutTerminology } = fixture;
  for (const partial of [withoutUncertainty, withoutTerminology]) {
    expect(() => parseGeneratedFixture(JSON.stringify(partial))).toThrow("lesson-specific uncertainty and terminology");
  }
  expect(() => parseGeneratedFixture(JSON.stringify({ ...fixture, wrong: fixture.solved }))).toThrow("must differ");
});
