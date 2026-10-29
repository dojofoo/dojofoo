import { afterEach, describe, expect, it, vi } from "vitest";
import * as childProcess from "node:child_process";
import * as filesystem from "node:fs";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ui, resolveAuthoringRoot, resolveUiEntry, resolveUiOpenPath } from "../src/commands/ui";
import { bareOpensUi } from "../src/commands/root";
import { listWorkspaces } from "@dojofoo/config/local-state";

vi.mock(import("node:child_process"), { spy: true });
vi.mock(import("node:fs"), { spy: true });

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("bundled dojo UI", () => {
  it("launches its installed Portless dependency even when PATH has another version", async () => {
    const { existsSync: exists } = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.useFakeTimers();
    const child = new EventEmitter() as ReturnType<typeof childProcess.spawn>;
    const launch = vi.spyOn(childProcess, "spawn").mockReturnValue(child);
    vi.spyOn(childProcess, "execFileSync").mockReturnValue("0.13.0");
    vi.spyOn(filesystem, "existsSync").mockImplementation(path => String(path).replaceAll("\\", "/").endsWith("/ui/server/index.mjs") || exists(path));
    try {
      await ui(tmpdir(), ["--no-open"]);
      const [executable, args] = launch.mock.calls[0];
      expect(executable).toBe(process.execPath);
      expect(args?.[0]).toMatch(/portless[/\\]dist[/\\]cli\.js$/);
      expect(args).toContain("dojofoo-ui-dojo");
      vi.advanceTimersByTime(2000);
      expect(childProcess.execFileSync).toHaveBeenCalledWith(process.execPath, [args![0], "list"], { encoding: "utf8" });
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

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

  it("registers a standalone authoring course before opening its UI", async () => {
    const root = mkdtempSync(join(tmpdir(), "dojo-authoring-registration-"));
    const stateHome = mkdtempSync(join(tmpdir(), "dojo-authoring-registration-home-"));
    temporaryRoots.push(root, stateHome);
    writeFileSync(join(root, "dojo.yaml"), "name: standalone\nversion: 1.0.0\n");
    vi.stubEnv("DOJOFOO_HOME", stateHome);
    vi.stubEnv("DOJO_PROJECT_ROOT", root);
    const { existsSync: exists } = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.spyOn(filesystem, "existsSync").mockImplementation(path => String(path).replaceAll("\\", "/").endsWith("/ui/server/index.mjs") || exists(path));
    vi.spyOn(childProcess, "spawn").mockReturnValue(new EventEmitter() as ReturnType<typeof childProcess.spawn>);
    try {
      await ui(root, ["--authoring", "--no-portless", "--no-open", "--port", "60766"]);
      expect(listWorkspaces({ stateHome }).map(workspace => workspace.path)).toContain(root);
    } finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); }
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

describe("bare dojofoo", () => {
  it("opens the UI from a terminal and prints the help for scripts", () => {
    expect(bareOpensUi([], true)).toBe(true);
    expect(bareOpensUi(["--no-open", "--port", "4699"], true)).toBe(true);
    expect(bareOpensUi([], false)).toBe(false);
    expect(bareOpensUi(["--no-open"], false)).toBe(false);
    for (const flags of [["--list"], ["--check"], ["--change", "other"], ["--help"], ["status"], ["--no-open", "--typo"]]) {
      expect(bareOpensUi(flags, true)).toBe(false);
    }
  });
});
