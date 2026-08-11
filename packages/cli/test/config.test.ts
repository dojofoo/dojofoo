import { describe, expect, it } from "vitest";
import { resolveConfig, validateManifest } from "../src/config";

describe("configuration defaults", () => {
  it("uses the stable Vercel registry while the custom domain DNS is unavailable", () => {
    expect(resolveConfig({}, "/tmp/dojofoo").registries).toMatchObject({
      dojofoo: "https://dojofoo.vercel.app/r/{name}.json",
    });
  });
});

describe("course discovery metadata", () => {
  it("accepts language, framework, author, and topical tags", () => {
    expect(validateManifest({
      name: "@acme/effect",
      version: "1.0.0",
      description: "Learn Effect.",
      author: "Ada Lovelace",
      language: "TypeScript",
      framework: "Effect",
      tags: ["Functional programming"],
      test: "pnpm test {template}",
      katas: [{ template: "katas/001/solution.ts" }],
    })).toEqual([]);
  });

  it("rejects tags that repeat the language or framework facets", () => {
    expect(validateManifest({
      name: "@acme/effect",
      version: "1.0.0",
      description: "Learn Effect.",
      language: "TypeScript",
      framework: "Effect",
      tags: ["typescript", "EFFECT", "Functional programming"],
      test: "pnpm test {template}",
      katas: [{ template: "katas/001/solution.ts" }],
    })).toEqual([
      '"tags" must not repeat "language" or "framework"',
    ]);
  });
});
