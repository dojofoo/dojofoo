import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { get } from "node:http";
import { createProxyServer, RouteStore } from "portless";

import { ui, resolveAuthoringRoot, resolvePortlessEntry, resolveUiEntry, resolveUiOpenPath } from "../src/commands/ui";
import { bareOpensUi } from "../src/commands/root";
import { listWorkspaces } from "@dojofoo/config/local-state";
vi.mock(import("node:child_process"), { spy: true });

const temporaryRoots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("bundled dojo UI", () => {
  it("quietly registers dojo.localhost on the existing proxy despite a custom TLD", async () => {
    const root = mkdtempSync(join(tmpdir(), "dojo-proxy-"));
    temporaryRoots.push(root);
    const state = join(root, "portless");
    const store = new RouteStore(state);
    store.addRoute("other.td", 4999, 0);
    const proxy = createProxyServer({ proxyPort: 0, tld: "td", getRoutes: () => store.loadRoutes() });
    await new Promise<void>(accept => proxy.listen(0, "127.0.0.1", accept));
    const proxyPort = (proxy.address() as { port: number }).port;
    writeFileSync(join(state, "proxy.port"), String(proxyPort));
    writeFileSync(join(state, "proxy.tld"), "td");
    mkdirSync(join(root, "dist/ui/server"), { recursive: true });
    writeFileSync(join(root, "dist/ui/server/index.mjs"), `
      import { createServer } from 'node:http';
      console.log('Server logs must not reach the terminal');
      createServer((request, response) => {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: true, instance: process.env.DOJO_UI_INSTANCE, workspace: process.cwd() }));
      }).listen(Number(process.env.PORT), process.env.HOST);
    `);
    vi.stubEnv("PORTLESS_STATE_DIR", state);
    vi.stubEnv("DOJOFOO_HOME", join(root, "home"));
    vi.stubEnv("DOJO_UI_DISABLE_PORTLESS", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await ui(root, ["--background", "--no-open"], pathToFileURL(join(root, "dist/index.js")).href);
      expect(log.mock.calls).toEqual([[`Go to http://dojo.localhost:${proxyPort}`]]);
      const body = await new Promise<string>((accept, reject) => {
        get({ hostname: "127.0.0.1", port: proxyPort, headers: { Host: "dojo.localhost" } }, response => {
          let body = "";
          response.on("data", chunk => { body += chunk; });
          response.on("end", () => accept(body));
        }).on("error", reject);
      });
      expect(JSON.parse(body)).toMatchObject({ ok: true, workspace: realpathSync(root) });
      expect(store.loadRoutes()).toEqual(expect.arrayContaining([
        expect.objectContaining({ hostname: "dojo.localhost" }),
        expect.objectContaining({ hostname: "other.td", port: 4999, pid: 0 }),
      ]));
      expect(store.loadRoutes().some(route => route.hostname === "dojo.td")).toBe(false);
    } finally {
      const route = store.loadRoutes().find(route => route.hostname === "dojo.localhost");
      if (route?.pid) { try { process.kill(-route.pid, "SIGTERM"); } catch {} }
      await new Promise<void>(accept => proxy.close(() => accept()));
    }
  });
  it("runs its ESM-only Portless dependency without a global executable", () => {
    const version = execFileSync(process.execPath, [resolvePortlessEntry(), "--version"], { encoding: "utf8" });
    expect(version.trim()).toBe("0.15.12");
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
    mkdirSync(join(root, "dist/ui/server"), { recursive: true });
    writeFileSync(join(root, "dist/ui/server/index.mjs"), "// fixture");
    vi.spyOn(childProcess, "spawn").mockReturnValue(new EventEmitter() as ReturnType<typeof childProcess.spawn>);
    vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await ui(root, ["--authoring", "--no-portless", "--no-open", "--port", "60766"], pathToFileURL(join(root, "dist/index.js")).href);
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
  it("opens bare invocation and preserves explicit command and flag handling", () => {
    expect(bareOpensUi([], true)).toBe(true);
    expect(bareOpensUi(["--no-open", "--port", "4699"], true)).toBe(true);
    expect(bareOpensUi([], false)).toBe(true);
    expect(bareOpensUi(["--no-open"], false)).toBe(false);
    for (const flags of [["--list"], ["--check"], ["--change", "other"], ["--help"], ["status"], ["--no-open", "--typo"]]) {
      expect(bareOpensUi(flags, true)).toBe(false);
    }
  });
});
