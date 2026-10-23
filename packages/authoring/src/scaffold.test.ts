import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scaffoldAuthoringWorkspace } from "./scaffold";

describe("authoring scaffold", () => {
  it("ships mise setup without a second evaluator and preserves existing authored scripts", () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-authoring-scaffold-"));
    scaffoldAuthoringWorkspace({ root, name: "draft", style: "katas" });
    expect(existsSync(resolve(root, "scripts/eval.ts"))).toBe(false);
    expect(readFileSync(resolve(root, "mise.toml"), "utf8")).toContain("[tasks.setup]");
    expect(readFileSync(resolve(root, ".gitignore"), "utf8")).toContain(".dojo/*");
    expect(existsSync(resolve(root, "gitignore"))).toBe(false);
    mkdirSync(resolve(root, "scripts"), { recursive: true });
    writeFileSync(resolve(root, "scripts/eval.ts"), "author-owned\n");
    writeFileSync(resolve(root, "dojo.yaml"), "name: author-owned\n");
    writeFileSync(resolve(root, ".gitignore"), "author-owned\n");

    scaffoldAuthoringWorkspace({ root, name: "ignored", style: "katas" });

    expect(readFileSync(resolve(root, "scripts/eval.ts"), "utf8")).toBe("author-owned\n");
    expect(readFileSync(resolve(root, "dojo.yaml"), "utf8")).toBe("name: author-owned\n");
    expect(readFileSync(resolve(root, ".gitignore"), "utf8")).toBe("author-owned\n");
  });
});
