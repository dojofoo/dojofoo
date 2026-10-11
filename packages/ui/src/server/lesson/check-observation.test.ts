import { describe, expect, it } from "vitest";
import { checkObservationInstruction, type CheckObservation } from "./service";
import { senseiTurn } from "./instructions";

const report = (complete: boolean) => ({ complete }) as CheckObservation["report"];

// Wording lives in contracts/TURNS.md and is judged by live evals.
// These tests pin the routing between turn prompts, not their sentences.
describe("check observation turn routing", () => {
  it("selects one TURNS.md prompt per check situation", () => {
    const cases = {
      "check-passed": { attempt: 1, codeChanged: true, report: report(true) },
      "check-changed": { attempt: 1, codeChanged: true, report: report(false) },
      "check-unchanged": { attempt: 1, codeChanged: false, report: report(false) },
      "check-unchanged-again": { attempt: 2, codeChanged: false, report: report(false) },
    };
    for (const [id, observation] of Object.entries(cases)) {
      expect(checkObservationInstruction(observation)).toBe(`${senseiTurn("check-base")} ${senseiTurn(id)}`);
    }
  });

  it("fills the repeated-attempt count", () => {
    const repeated = checkObservationInstruction({ attempt: 4, codeChanged: false, report: report(false) });
    expect(repeated).toBe(`${senseiTurn("check-base")} ${senseiTurn("check-repeated", { attempt: "4" })}`);
    expect(repeated).not.toMatch(/\{\{|\}\}/u);
  });
});
