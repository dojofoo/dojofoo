import { expect, it } from "vitest";
import platform from "./contracts/DOJOFOO.md?raw";
import katas from "./contracts/KATAS.md?raw";
import { senseiInstructions } from "./instructions";

it("preserves the existing instruction contract byte-for-byte", () => {
  const sensei = '# Lesson\n<Present id="whitespace">Example</Present>';
  expect(senseiInstructions({ mode: "katas", dojo: "Course rules", sensei })).toBe(
    `${platform}\n\n${katas}\n\nAvailable learner fragment IDs: whitespace.\n\nDOJO.md for this course:\nCourse rules\n\nSensei lesson source:\n${sensei}`,
  );
});

it("does not carry a previous lesson's material into a new contract", () => {
  senseiInstructions({ mode: "katas", dojo: "First course", sensei: '<Present id="first-only">Secret first lesson</Present>' });
  const next = senseiInstructions({ mode: "interactive", dojo: "Second course", sensei: "Second lesson" });
  expect(next).toContain(platform);
  expect(next).toContain("Second course");
  expect(next).toContain("Second lesson");
  expect(next).toContain("Available learner fragment IDs: none.");
  expect(next).not.toContain(katas);
  expect(next).not.toContain("First course");
  expect(next).not.toContain("first-only");
  expect(next).not.toContain("KYOSHI");
});
