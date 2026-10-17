import { expect, it } from "vitest";
import { retainLearnerEvidence } from "./learner-evidence";
import { recordLearnerObservation } from "./learner-observations";

const sources = retainLearnerEvidence([], [
  { id: "1", role: "user", parts: [{ type: "text", content: "I do not know what a callback is." }] },
  { id: "2", role: "assistant", parts: [{ type: "text", content: "A callback is a function passed to another function." }] },
  { id: "3", role: "user", parts: [{ type: "text", content: "I can explain callbacks now. I was confused by the name." }] },
], "first", "session");
const input = { category: "uncertainty", interpretation: "Learner reports unfamiliarity with callbacks.", status: "active", source: sources[0]!.source };
// Input uses only the citation tuple exposed by the tool, not lesson identity.
const citation = (index: number) => {
  const { sessionId, messageId, sha256 } = sources[index]!.source;
  return { sessionId, messageId, sha256 };
};

it("stores a bounded interpretation and its actual quoted evidence", () => {
  const { observation, observations } = recordLearnerObservation([], { ...input, source: citation(0) }, sources);
  expect(observations).toEqual([observation]);
  expect(observation.evidence).toEqual(sources[0]);
  expect(observation).not.toHaveProperty("mastery");
  expect(recordLearnerObservation(observations, { ...input, source: citation(0) }, sources).observations).toHaveLength(1);
});

it("does not treat a teacher's explanation as demonstrated learner understanding", () => {
  expect(() => recordLearnerObservation([], { ...input, category: "understanding", source: citation(1) }, sources)).toThrow("needs a user message");
  expect(recordLearnerObservation([], { ...input, category: "support", source: citation(1) }, sources).observation.evidence.role).toBe("assistant");
});

it("rejects invented, stale and cross-course citations", () => {
  for (const source of [{ ...citation(0), sha256: "f".repeat(64) }, { ...citation(0), sessionId: "unrelated-session" }]) {
    expect(() => recordLearnerObservation([], { ...input, source }, sources)).toThrow("not available");
  }
  expect(() => recordLearnerObservation([], { ...input, source: citation(0) }, [])).toThrow("not available");
});

it("replaces a prior interpretation using newer learner evidence", () => {
  const first = recordLearnerObservation([], { ...input, source: citation(0) }, sources);
  const corrected = recordLearnerObservation(first.observations, { ...input, status: "resolved", interpretation: "Learner says the terminology is clear now; transfer has not been demonstrated.", source: citation(2), replaces: first.observation.id }, sources);
  expect(corrected.observations).toEqual([corrected.observation]);
  expect(corrected.observation.evidence.text).toContain("I can explain callbacks now");
  expect(() => recordLearnerObservation([], { ...input, source: citation(2), replaces: first.observation.id }, sources)).toThrow("does not exist");
});

it("rejects unsupported fields and keeps only the most recent 24 interpretations", () => {
  expect(() => recordLearnerObservation([], { ...input, source: citation(0), mastery: 100 }, sources)).toThrow();
  let observations: ReturnType<typeof recordLearnerObservation>["observations"] = [];
  for (let i = 0; i < 30; i++) observations = recordLearnerObservation(observations, { ...input, source: citation(0), interpretation: `Observation ${i}` }, sources).observations;
  expect(observations).toHaveLength(24);
  expect(observations[0]?.interpretation).toBe("Observation 6");
});
