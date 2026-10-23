import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import {
  parseGithubSource,
  readInstalledSource,
  writeInstalledSource,
} from "../src/source";
import { classifySource, existingDojoMessage } from "../src/commands/add";
import { resolveUpdateSource } from "../src/commands/update";

describe("dojo sources", () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

  it("recognizes an owner/repository GitHub source", () => {
    expect(parseGithubSource("dojofoo/starter")).toEqual({ repository: "dojofoo/starter" });
    expect(parseGithubSource("@dojofoo/starter")).toBeNull();
    expect(parseGithubSource("starter")).toBeNull();
    expect(classifySource("dojofoo/starter")).toBe("github");
    expect(classifySource("@dojofoo/starter")).toBe("npm");
  });

  it("rejects the deprecated npm transport with a Git migration", async () => {
    const root = mkdtempSync(join(tmpdir(), "dojo-npm-deprecated-"));
    roots.push(root);
    writeFileSync(resolve(root, ".dojorc"), JSON.stringify({ currentDojo: "", currentKata: null, editor: null }));
    const { add } = await import("../src/commands/add");
    await expect(add(root, ["@dojofoo/starter-kata"])).rejects.toThrow("dojofoo/starter-kata");
  });

  it("resolves updates from the installed source lock", () => {
    const root = mkdtempSync(join(tmpdir(), "dojo-update-"));
    roots.push(root);
    const dojo = resolve(root, ".dojos/starter");
    mkdirSync(dojo, { recursive: true });
    writeFileSync(resolve(dojo, "dojo.yaml"), "name: starter\n");
    writeInstalledSource(dojo, {
      version: 1,
      type: "github",
      locator: "external/package",
      integrity: "sha256-old",
    });

    expect(resolveUpdateSource(root, "external/package")).toMatchObject({
      dojo: "starter",
      source: { type: "github", locator: "external/package" },
    });
  });

  it("describes an existing project-local dojo using the update command", () => {
    const root = mkdtempSync(join(tmpdir(), "dojo-existing-"));
    roots.push(root);
    const dojo = resolve(root, ".dojos/effect-ts");
    mkdirSync(dojo, { recursive: true });
    writeInstalledSource(dojo, {
      version: 1,
      type: "github",
      locator: "dojofoo/effect-ts",
    });

    const message = existingDojoMessage(root, "effect-ts");
    expect(message).toContain("already installed in this project");
    expect(message).toContain("Source:   dojofoo/effect-ts");
    expect(message).toContain("npx dojofoo update effect-ts");
    expect(message).not.toContain("add effect-ts --force");
  });

  it("persists the canonical source beside the installed dojo", () => {
    const root = mkdtempSync(join(tmpdir(), "dojo-source-"));
    roots.push(root);
    const dojo = resolve(root, ".dojos/starter");
    mkdirSync(dojo, { recursive: true });
    writeFileSync(resolve(dojo, "dojo.json"), "{}");

    writeInstalledSource(dojo, {
      version: 1,
      type: "github",
      locator: "dojofoo/starter",
      integrity: "sha256-example",
    });

    expect(readInstalledSource(dojo)).toEqual({
      version: 1,
      type: "github",
      locator: "dojofoo/starter",
      integrity: "sha256-example",
    });
  });

  it("ignores malformed source locks", () => {
    const root = mkdtempSync(join(tmpdir(), "dojo-source-invalid-"));
    roots.push(root);
    mkdirSync(root, { recursive: true });
    writeFileSync(resolve(root, ".dojo-source.json"), JSON.stringify({
      version: 1,
      type: "gitlab",
      locator: "external/package",
    }));

    expect(readInstalledSource(root)).toBeNull();
  });
});
