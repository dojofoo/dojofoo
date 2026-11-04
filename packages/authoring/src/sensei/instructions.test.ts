import { describe, expect, it } from "vitest";
import { readPrompt } from "../prompts.ts";
import { contract as embedded } from "../../agents/sensei/contracts.ts";
import { senseiCourseInstructions, senseiPersonaInstructions } from "./instructions.ts";

const contract = (name: string) => readPrompt(`sensei/contracts/${name}`).trim();

describe("Sensei instructions", () => {
  it("persona instructions are DOJOFOO and NATIVE only", () => {
    expect(senseiPersonaInstructions()).toBe(`${contract("DOJOFOO.md")}\n\n${contract("NATIVE.md")}`);
    expect(contract("NATIVE.md")).toContain("Your native file and shell tools can only read. If a tool is refused, carry on without mentioning it.");
  });

  it("the course instructions carry the mode's style and the course DOJO.md", () => {
    const katas = senseiCourseInstructions({ mode: "katas", guidance: "PRIVATE-GUIDANCE-first\n" });
    expect(katas).toBe(`${contract("KATAS.md")}\n\nDOJO.md for this course:\nPRIVATE-GUIDANCE-first`);
    expect(senseiCourseInstructions({ mode: "katas", guidance: "  " })).toBe(contract("KATAS.md"));
  });

  it("an interactive course gets INTERACTIVE.md, never KATAS.md", () => {
    const interactive = senseiCourseInstructions({ mode: "interactive", guidance: "PRIVATE-GUIDANCE-first" });
    expect(interactive).toContain(contract("INTERACTIVE.md"));
    expect(interactive).not.toContain(contract("KATAS.md"));
    expect(interactive).toContain("Do not claim to have changed progress.");
  });

  it("the prepared server embeds the shipped contracts unchanged", () => {
    for (const name of ["DOJOFOO.md", "NATIVE.md", "KATAS.md", "INTERACTIVE.md"] as const) expect(embedded(name).trim()).toBe(readPrompt(`sensei/contracts/${name}`).trim());
    expect(senseiCourseInstructions({ mode: "interactive", guidance: "x" }, embedded)).toBe(senseiCourseInstructions({ mode: "interactive", guidance: "x" }));
  });

  it("TURNS.md seeds a new conversation with the learner's evidence", () => {
    expect(contract("TURNS.md")).toContain("## evidence-seed\n\nExcerpts from this learner's earlier conversation in this course, for continuity. Don't quote them back or treat them as proof of mastery.");
  });
});
