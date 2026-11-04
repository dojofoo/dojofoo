import { readPrompt } from "@dojofoo/authoring/prompts";
import { promptSection, promptSections } from "@dojofoo/authoring/prompts";
import { expect, it } from "vitest";
import { senseiTurn } from "./instructions";

const turns = promptSections(readPrompt("sensei/contracts/TURNS.md"));

it("the check report and begin turns read TURNS.md", () => {
  expect(senseiTurn("begin")).toBe(promptSection(turns, "begin"));
  expect(senseiTurn("checks-ran")).toBe(promptSection(turns, "checks-ran"));
  expect(senseiTurn("checks-ran")).toBe("Ran lesson checks.");
  expect(senseiTurn("check-repeated", { attempt: "3" })).toContain("3");
});
