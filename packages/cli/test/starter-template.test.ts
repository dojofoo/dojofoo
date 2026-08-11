import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseManifest } from "../src/config";

const starterRoot = resolve(import.meta.dirname, "../../../dojos/starter");
const registryRoot = resolve(import.meta.dirname, "../../../apps/web/public/r");

function read(path: string) {
  return readFileSync(resolve(starterRoot, path), "utf8");
}

describe("@dojofoo/starter authoring template", () => {
  it("ships a publishable three-kata dojo with complete teaching material", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      name: string;
      private?: boolean;
      files?: string[];
      publishConfig?: { access?: string };
    };
    const manifest = parseManifest(read("dojo.json"), resolve(starterRoot, "dojo.json"));

    expect(packageJson).toMatchObject({
      name: "@dojofoo/starter",
      publishConfig: { access: "public" },
    });
    expect(packageJson.private).not.toBe(true);
    expect(packageJson.files).toEqual(expect.arrayContaining([
      "katas",
      "skills",
      "DOJO.md",
      "README.md",
      "dojo.json",
      "tsconfig.json",
      "vitest.config.ts",
    ]));
    expect(manifest).toMatchObject({
      name: "@dojofoo/starter",
      runner: { adapter: "vitest", coverage: true },
      test: "npx vitest run {template}",
    });
    expect(manifest.katas).toHaveLength(3);

    for (const kata of manifest.katas) {
      const directory = resolve(starterRoot, kata.template, "..");
      expect(existsSync(resolve(starterRoot, kata.template))).toBe(true);
      expect(existsSync(resolve(directory, "solution.test.ts"))).toBe(true);
      expect(existsSync(resolve(directory, "KATA.md"))).toBe(true);
      expect(existsSync(resolve(directory, "SENSEI.md"))).toBe(true);

      const learnerBrief = readFileSync(resolve(directory, "KATA.md"), "utf8");
      const sensei = readFileSync(resolve(directory, "SENSEI.md"), "utf8");
      expect(learnerBrief).toContain("## Goal");
      expect(learnerBrief).toContain("## Tasks");
      expect(sensei).toContain("## Briefing");
      expect(sensei).toContain("## Test Map");
      expect(sensei).toContain("## Teaching Approach");
      expect(sensei).toContain("## On Completion");
    }

    expect(read("DOJO.md")).toContain("Never give solutions");
    expect(existsSync(resolve(starterRoot, "skills/starter-sensei/SKILL.md"))).toBe(true);
  });

  it("is discoverable by its short registry name", () => {
    const index = JSON.parse(readFileSync(resolve(registryRoot, "index.json"), "utf8")) as {
      items: Array<{ name: string }>;
    };
    const item = JSON.parse(readFileSync(resolve(registryRoot, "starter.json"), "utf8"));

    expect(index.items).toContainEqual(expect.objectContaining({ name: "starter" }));
    expect(item).toMatchObject({
      name: "@dojofoo/starter",
      source: { type: "npm", package: "@dojofoo/starter" },
    });
  });
});
