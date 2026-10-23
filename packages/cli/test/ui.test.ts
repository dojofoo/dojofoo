import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { resolveAuthoringRoot, resolveUiEntry, resolveUiOpenPath } from "../src/commands/ui";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("bundled dojo UI", () => {
  it("opens the installed master from its course directory or the workspace selection", () => {
    const workspace = mkdtempSync(join(tmpdir(), "dojo-authoring-root-"));
    temporaryRoots.push(workspace);
    const course = join(workspace, "courses/master");
    const other = join(workspace, "courses/other");
    for (const path of [course, other]) {
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, "dojo.yaml"), "name: example\n");
    }
    writeFileSync(join(workspace, ".dojorc"), JSON.stringify({ currentDojo: "other" }));
    expect(resolveAuthoringRoot(course, workspace)).toBe(course);
    expect(resolveAuthoringRoot(workspace, workspace)).toBe(other);
  });
  it("opens authoring inside the same Portless UI", () => {
    expect(resolveUiOpenPath(["--authoring"])).toBe("/authoring");
    expect(resolveUiOpenPath([])).toBe("");
  });

  it("resolves the production server from an installed CLI package", () => {
    const root = mkdtempSync(join(tmpdir(), "dojo-packed-ui-"));
    temporaryRoots.push(root);
    mkdirSync(resolve(root, "dist"), { recursive: true });
    mkdirSync(resolve(root, "dist/ui/server"), { recursive: true });
    writeFileSync(resolve(root, "dist/ui/server/index.mjs"), "// bundled server");

    const cliModuleUrl = pathToFileURL(resolve(root, "dist/index.js")).href;

    expect(resolveUiEntry(cliModuleUrl)).toBe(resolve(root, "dist/ui/server/index.mjs"));
  });
});
