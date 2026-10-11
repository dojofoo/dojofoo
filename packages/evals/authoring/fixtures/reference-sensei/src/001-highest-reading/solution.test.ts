import { expect, it } from "vitest";
import { highestReading } from "@/katas/001-highest-reading/solution";

it.each([
  [[], undefined],
  [[0], 0],
  [[4], 4],
  [[3, 9, 2], 9],
  [[-5, -2, -9], -2],
  [[2, 4, 1, 8], 8],
  [[6, 6, 2], 6],
  [[-0.5, 0.25, -1], 0.25],
] as const)("highestReading(%j) returns %s", (readings, expected) => {
  expect(highestReading([...readings])).toBe(expected);
});
