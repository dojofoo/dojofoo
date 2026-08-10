import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { resolveUiEntry } from "../src/commands/ui";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("bundled dojo UI", () => {
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
