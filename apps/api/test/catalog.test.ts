import { describe, expect, it } from "vitest";
import { courseCatalog } from "../src/catalog";

describe("course catalog", () => {
  it("publishes every bundled dojo with categories inferred from its kata domain", () => {
    expect(courseCatalog.map((course) => course.slug)).toEqual([
      "build-llm",
      "effect-ts",
      "pydantic-agents",
    ]);
    expect(courseCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: "build-llm",
          categories: ["Python", "Machine learning", "LLMs"],
          kataCount: 114,
        }),
        expect.objectContaining({
          slug: "effect-ts",
          categories: ["TypeScript", "Functional programming"],
          kataCount: 40,
        }),
        expect.objectContaining({
          slug: "pydantic-agents",
          categories: ["Python", "AI agents", "Data validation"],
          kataCount: 3,
        }),
      ]),
    );
  });
});
