import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const acquisition = vi.hoisted(() => ({ version: "0.0.1", calls: [] as string[] }));

vi.mock("../src/source-acquisition", () => ({
  acquireRemoteDojo: vi.fn(async (source: string, _type: string, directory: string) => {
    acquisition.calls.push(source);
    mkdirSync(resolve(directory, "katas", "001-first"), { recursive: true });
    writeFileSync(resolve(directory, "dojo.yaml"), [
      "mode: katas",
      "name: '@test/remote-dojo'",
      `version: ${acquisition.version}`,
      "description: Remote fixture.",
      "test: echo ok",
      "katas:",
      "  - name: 001-first",
      "    template: katas/001-first/solution.ts",
    ].join("\n"));
    writeFileSync(resolve(directory, "DOJO.md"), "# Remote dojo\n");
    writeFileSync(resolve(directory, "katas", "001-first", "SENSEI.md"), "# Sensei\n");
    writeFileSync(resolve(directory, "katas", "001-first", "solution.ts"), "export const value = 1;\n");
    for (const role of ["sensei", "kyoshi"]) {
      mkdirSync(resolve(directory, ".dojo", role, ".eve"), { recursive: true });
      writeFileSync(resolve(directory, ".dojo", role, "instructions.md"), `${role} guidance\n`);
      writeFileSync(resolve(directory, ".dojo", role, ".eve/private.json"), "PRIVATE STATE");
    }
    mkdirSync(resolve(directory, ".dojo/state"), { recursive: true });
    writeFileSync(resolve(directory, ".dojo/state/session.json"), "PRIVATE STATE");
    writeFileSync(resolve(directory, "KYOSHI.md"), "Authoring guidance\n");
    writeFileSync(resolve(directory, "LICENSE"), "Fixture license\n");
    writeFileSync(resolve(directory, ".gitignore"), ".env*\n!.env.example\n");
    writeFileSync(resolve(directory, ".env.local"), "FAKE_FIXTURE=do-not-install\n");
    return directory;
  }),
  gigetLocator: (source: string) => source,
}));

import { add } from "../src/commands/add";
import { remove } from "../src/commands/remove";
import { update } from "../src/commands/update";
import { readInstalledSource } from "../src/source";

const roots: string[] = [];

afterEach(() => {
  acquisition.version = "0.0.1";
  acquisition.calls.length = 0;
  delete process.env.DOJOFOO_HOME;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace() {
  const root = mkdtempSync(resolve(tmpdir(), "dojofoo-giget-install-"));
  const state = mkdtempSync(resolve(tmpdir(), "dojofoo-giget-state-"));
  roots.push(root, state);
  process.env.DOJOFOO_HOME = state;
  writeFileSync(resolve(root, ".dojorc"), `${JSON.stringify({
    currentDojo: "",
    currentKata: null,
    editor: null,
    progress: {},
  }, null, 2)}\n`);
  return root;
}

describe("Giget-backed dojo lifecycle", () => {
  it("installs, updates, and removes a remote dojo without changing lifecycle ownership", async () => {
    const root = workspace();

    await add(root, ["example/remote-dojo"]);

    const dojo = resolve(root, "courses", "remote-dojo");
    expect(() => readFileSync(resolve(dojo, ".dojo/kyoshi/instructions.md"))).toThrow();
    expect(() => readFileSync(resolve(dojo, "KYOSHI.md"))).toThrow();
    expect(() => readFileSync(resolve(dojo, ".env.local"))).toThrow();
    expect(readFileSync(resolve(dojo, ".dojo/sensei/instructions.md"), "utf8")).toContain("sensei guidance");
    expect(acquisition.calls).toEqual(["example/remote-dojo"]);
    expect(readInstalledSource(dojo)).toMatchObject({
      type: "github",
      locator: "example/remote-dojo",
      integrity: expect.stringMatching(/^sha256-/u),
    });
    expect(JSON.parse(readFileSync(resolve(root, ".dojorc"), "utf8"))).toMatchObject({
      currentDojo: "remote-dojo",
      currentKata: "001-first",
    });

    acquisition.version = "0.0.2";
    await update(root, ["remote-dojo"]);
    expect(acquisition.calls).toEqual(["example/remote-dojo", "example/remote-dojo"]);
    expect(readFileSync(resolve(dojo, "dojo.yaml"), "utf8")).toContain("version: 0.0.2");

    remove(root, ["remote-dojo"]);
    expect(() => readFileSync(resolve(dojo, "dojo.yaml"), "utf8")).toThrow();
    expect(JSON.parse(readFileSync(resolve(root, ".dojorc"), "utf8"))).toMatchObject({
      currentDojo: "",
      currentKata: null,
    });
  });

  it("keeps authored Kyoshi definitions only with --master, preserves the license and retains the choice on update", async () => {
    const root = workspace();
    await add(root, ["example/remote-dojo", "--master"]);
    const dojo = resolve(root, "courses/remote-dojo");
    expect(JSON.parse(readFileSync(resolve(root, ".dojorc"), "utf8")).currentKata).toBeNull();
    expect(readFileSync(resolve(dojo, "KYOSHI.md"), "utf8")).toContain("Authoring guidance");
    expect(readFileSync(resolve(dojo, ".dojo/kyoshi/instructions.md"), "utf8")).toContain("kyoshi guidance");
    expect(readFileSync(resolve(dojo, "LICENSE"), "utf8")).toBe("Fixture license\n");
    for (const path of [".dojo/state/session.json", ".dojo/kyoshi/.eve/private.json", ".dojo/sensei/.eve/private.json", ".env.local"]) {
      expect(() => readFileSync(resolve(dojo, path)), path).toThrow();
    }
    expect(readInstalledSource(dojo)?.authoring).toBe(true);
    acquisition.version = "0.0.2";
    await update(root, ["remote-dojo"]);
    expect(readFileSync(resolve(dojo, ".dojo/kyoshi/instructions.md"), "utf8")).toContain("kyoshi guidance");
    expect(readInstalledSource(dojo)?.authoring).toBe(true);
  });

  it("can opt an unchanged learner installation into authoring without a new upstream version", async () => {
    const root = workspace();
    await add(root, ["example/remote-dojo"]);
    await add(root, ["example/remote-dojo", "--master", "--force"]);
    const dojo = resolve(root, "courses/remote-dojo");
    expect(readFileSync(resolve(dojo, "KYOSHI.md"), "utf8")).toContain("Authoring guidance");
    expect(readInstalledSource(dojo)?.authoring).toBe(true);
  });
});
