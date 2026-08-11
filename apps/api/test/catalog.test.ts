import { createHash } from "node:crypto";
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
          version: "0.0.4",
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

  it("uses content-addressed SHA-256 hashes for course snapshots", () => {
    for (const course of courseCatalog) {
      const expected = createHash("sha256")
        .update(course.files?.map(({ path, contents }) => `${path}\0${contents}`).join("\0") ?? "")
        .digest("hex");
      expect(course.hash).toBe(expected);
    }
    expect(new Set(courseCatalog.map((course) => course.hash))).toHaveLength(courseCatalog.length);
  });

  it("snapshots the complete bundled course tree used by the detail contract", () => {
    const effect = courseCatalog.find((course) => course.slug === "effect-ts");

    expect(effect?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "package.json" }),
        expect.objectContaining({ path: "katas/001-hello-effect/SENSEI.md" }),
        expect.objectContaining({ path: "katas/040-request-batching/solution.test.ts" }),
      ]),
    );
  });
});
