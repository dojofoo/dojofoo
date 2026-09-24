import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { scaffoldAuthoringWorkspace } from "@dojofoo/authoring/scaffold";

describe("kyoshi scaffold", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
  it("copies authoring mechanics without subject or lesson content", () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-kyoshi-"));
    roots.push(root);
    scaffoldAuthoringWorkspace({ root, name: "empty-course", style: "katas" });

    const manifest = parseYaml(readFileSync(resolve(root, "dojo.yaml"), "utf8"));
    const packageManifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    expect(manifest.katas).toEqual([]);
    expect(manifest.description).toBe("");
    expect(packageManifest.name).toBe("empty-course");
    expect(readFileSync(resolve(root, "DOJO.md"), "utf8"))
      .toBe(readFileSync(new URL("../../authoring/templates/katas/DOJO.md", import.meta.url), "utf8"));
    expect(existsSync(resolve(root, "src", "001-normalize-label"))).toBe(false);
    expect(existsSync(resolve(root, "scripts", "eval.ts"))).toBe(true);
    expect(existsSync(resolve(root, "evals"))).toBe(false);
  });

  it("does not rename an existing project when authoring is opened", () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-kyoshi-existing-"));
    roots.push(root);
    writeFileSync(resolve(root, "package.json"), '{"name":"existing-project"}\n');
    writeFileSync(resolve(root, "dojo.yaml"), "mode: katas\nname: existing-course\nkatas: []\n");

    scaffoldAuthoringWorkspace({ root, name: "ignored-name", style: "katas" });

    expect(JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).name)
      .toBe("existing-project");
    expect(parseYaml(readFileSync(resolve(root, "dojo.yaml"), "utf8")).name)
      .toBe("existing-course");
  });
});
