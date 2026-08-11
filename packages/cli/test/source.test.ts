import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import {
  githubArchiveUrl,
  parseGithubSource,
  readInstalledSource,
  writeInstalledSource,
} from "../src/source";
import { classifySource } from "../src/commands/add";
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

  it("resolves updates from the installed source lock", () => {
    const root = mkdtempSync(join(tmpdir(), "dojo-update-"));
    roots.push(root);
    const dojo = resolve(root, ".dojos/starter");
    mkdirSync(dojo, { recursive: true });
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

  it("builds a GitHub archive URL without accepting unsafe names", () => {
    expect(githubArchiveUrl("dojofoo/starter")).toBe(
      "https://codeload.github.com/dojofoo/starter/tar.gz/HEAD",
    );
    expect(() => githubArchiveUrl("dojofoo/../starter")).toThrow("Invalid GitHub repository");
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
