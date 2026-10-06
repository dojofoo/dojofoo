import { expect, it } from "vitest";
import instructions from "./instructions";

it("distinguishes native course paths from Eve's virtual filesystem", () => {
  expect(instructions.content).toContain("Use relative paths: dojo.yaml, DOJO.md, and src/");
  expect(instructions.content).toContain("never pass /course or /workspace to native harness tools");
  expect(instructions.content).not.toContain("authoring workspace is /course");
});
