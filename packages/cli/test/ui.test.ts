import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync, realpathSync } from "node:fs";
import { createSecureContext } from "node:tls";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { createServer, get } from "node:http";
import type { AddressInfo } from "node:net";
import { createProxyServer, RouteStore } from "portless";

import { ui, resolveAuthoringRoot, resolvePortlessEntry, resolveUiEntry, resolveUiOpenPath } from "../src/commands/ui";
import { bareOpensUi } from "../src/commands/root";
import { listWorkspaces, observeLocalContext, observeWorkspacePath } from "@dojofoo/config/local-state";
import { dojoDir } from "@dojofoo/config";
import { personaForKind } from "@dojofoo/protocol";
import { add } from "../src/commands/add";
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
  it("leaves other TLDs' names alone and says how to restart a TLS proxy that doesn't serve localhost", async () => {
    const root = mkdtempSync(join(tmpdir(), "dojo-proxy-tls-"));
    temporaryRoots.push(root);
    const state = join(root, "portless");
    mkdirSync(state, { recursive: true });
    // Like Portless, the proxy holds certificates for its own TLD only and refuses any other name
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=dojo.td",
      "-addext", "subjectAltName=DNS:dojo.td", "-keyout", join(state, "key.pem"), "-out", join(state, "ca.pem")], { stdio: "ignore" });
    const cert = readFileSync(join(state, "ca.pem"));
    const key = readFileSync(join(state, "key.pem"));
    const store = new RouteStore(state);
    const proxy = createProxyServer({ proxyPort: 0, tld: "td", getRoutes: () => store.loadRoutes(), tls: { cert, key,
      SNICallback: (name, done) => name.endsWith(".td") ? done(null, createSecureContext({ cert, key })) : done(new Error(`Refusing certificate for ${name}`)) } });
    await new Promise<void>(accept => proxy.listen(0, "127.0.0.1", accept));
    const proxyPort = (proxy.address() as { port: number }).port;
    writeFileSync(join(state, "proxy.port"), String(proxyPort));
    writeFileSync(join(state, "proxy.tls"), "");
    writeFileSync(join(state, "proxy.tld"), "td");
    mkdirSync(join(root, "dist/ui/server"), { recursive: true });
    writeFileSync(join(root, "dist/ui/server/index.mjs"), "");
    vi.stubEnv("PORTLESS_STATE_DIR", state);
    vi.stubEnv("DOJOFOO_HOME", join(root, "home"));
    vi.stubEnv("DOJO_UI_DISABLE_PORTLESS", "");
    try {
      await expect(ui(root, ["--background", "--no-open"], pathToFileURL(join(root, "dist/index.js")).href))
        .rejects.toThrow("PORTLESS_TLD=td,localhost portless proxy start");
      expect(store.loadRoutes()).toEqual([]);
    } finally {
      await new Promise<void>(accept => proxy.close(() => accept()));
    }
  });

  it("prints its flags for --help instead of starting a UI", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const spawned = vi.mocked(childProcess.spawn);
    spawned.mockClear();
    await ui(tmpdir(), ["--help"], pathToFileURL(join(tmpdir(), "missing/dist/index.js")).href);
    expect(String(write.mock.calls[0]?.[0])).toMatch(/^Usage: dojofoo ui \[flags\]\n[\s\S]*--background/u);
    expect(spawned).not.toHaveBeenCalled();
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
      expect(listWorkspaces({ stateHome }).find(workspace => workspace.path === root)?.kind).toBe("draft");
    } finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); }
  });

  it("opens a master copy as its own draft workspace, separate from its learner workspace and its source", async () => {
    const scratch = realpathSync(mkdtempSync(join(tmpdir(), "dojo-master-copy-")));
    temporaryRoots.push(scratch);
    const [source, workspace, stateHome, cli] = ["source", "workspace", "home", "cli"].map(name => join(scratch, name));
    for (const directory of [join(source, "src/first"), workspace, stateHome, join(cli, "dist/ui/server")]) mkdirSync(directory, { recursive: true });
    writeFileSync(join(source, "dojo.yaml"), "mode: katas\nname: master-copy\nversion: 0.0.1\ndescription: A course.\ntest: echo ok\nkatas:\n  - name: first\n    template: src/first/kata.ts\n");
    writeFileSync(join(source, "src/first/kata.ts"), "export const answer = 0;\n");
    writeFileSync(join(source, "src/first/SENSEI.md"), "# First\n\nTeach it.\n");
    writeFileSync(join(cli, "dist/ui/server/index.mjs"), "// fixture");
    vi.stubEnv("DOJOFOO_HOME", stateHome);
    vi.spyOn(console, "log").mockImplementation(() => {});
    observeWorkspacePath(source, { stateHome, kind: "draft" });
    await add(workspace, [source, "--master"]);
    observeLocalContext(workspace, { stateHome });
    const course = dojoDir(workspace, "master-copy");
    vi.stubEnv("DOJO_PROJECT_ROOT", resolveAuthoringRoot(course, workspace));
    vi.spyOn(childProcess, "spawn").mockReturnValue(new EventEmitter() as ReturnType<typeof childProcess.spawn>);
    await ui(course, ["--authoring", "--no-portless", "--no-open", "--port", "60767"], pathToFileURL(join(cli, "dist/index.js")).href);

    const rows = listWorkspaces({ stateHome });
    const row = (path: string) => rows.find(item => item.path === path);
    expect(rows).toHaveLength(3);
    expect(row(course)).toMatchObject({ kind: "draft" });
    expect(row(workspace)).toMatchObject({ kind: "learner" });
    expect(row(source)).toMatchObject({ kind: "draft", path: source });
    // The copy's own identity: .dojo/instance.json was not copied from the source
    expect(new Set(rows.map(item => item.id)).size).toBe(3);
    expect(personaForKind(row(course)!.kind!)).toBe("kyoshi");
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

describe("a dojofoo UI that is already running", () => {
  // Stands in for the running UI: it answers only its health, with what it was started with
  async function runningUi(started: { version?: string; build?: string; root?: string }) {
    const server = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(request.url === "/api/health" ? { ok: true, ...started, instance: "running" } : {}));
    });
    await new Promise<void>(accept => server.listen(0, "127.0.0.1", accept));
    return { port: (server.address() as AddressInfo).port, close: () => new Promise<void>(accept => server.close(() => accept())) };
  }
  // A CLI of version 1.2.3 whose UI server is never started: spawning is mocked
  function cli() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "dojo-running-ui-")));
    temporaryRoots.push(root);
    mkdirSync(join(root, "dist/ui/server"), { recursive: true });
    writeFileSync(join(root, "dist/ui/server/index.mjs"), "// fixture");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "dojofoo", version: "1.2.3" }));
    vi.stubEnv("DOJOFOO_HOME", join(root, "home"));
    vi.stubEnv("DOJO_PROJECT_ROOT", root);
    vi.stubEnv("DOJO_UI_NO_OPEN", "");
    const child = () => Object.assign(new EventEmitter(), { kill: vi.fn(), unref: vi.fn() }) as unknown as ReturnType<typeof childProcess.spawn>;
    const spawn = vi.spyOn(childProcess, "spawn").mockImplementation(child);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    return { root, moduleUrl: pathToFileURL(join(root, "dist/index.js")).href, spawn, log };
  }
  // What a server this CLI starts in its folder is started with, and so reports: one launch beside a server of another version
  async function startedWith({ root, moduleUrl, spawn, log }: ReturnType<typeof cli>) {
    const other = await runningUi({ version: "1.2.2" });
    try {
      await ui(root, ["--no-portless", "--background", "--no-open", "--port", String(other.port)], moduleUrl);
    } finally { await other.close(); }
    const env = (spawn.mock.calls.at(-1)![2] as childProcess.SpawnOptions).env!;
    expect(env).toMatchObject({ DOJO_UI_VERSION: "1.2.3", DOJO_UI_BUILD: expect.any(String), DOJO_PROJECT_ROOT: root });
    spawn.mockClear();
    log.mockClear();
    return { version: env.DOJO_UI_VERSION, build: env.DOJO_UI_BUILD, root: env.DOJO_PROJECT_ROOT };
  }
  // dojo.localhost routed to the running UI through a Portless proxy of the test's own; PID 0 marks a route no replacement may signal
  async function proxyTo(root: string, port: number) {
    const state = join(root, "portless");
    const store = new RouteStore(state);
    store.addRoute("dojo.localhost", port, 0);
    const proxy = createProxyServer({ proxyPort: 0, getRoutes: () => store.loadRoutes() });
    await new Promise<void>(accept => proxy.listen(0, "127.0.0.1", accept));
    const proxyPort = (proxy.address() as AddressInfo).port;
    writeFileSync(join(state, "proxy.port"), String(proxyPort));
    vi.stubEnv("PORTLESS_STATE_DIR", state);
    vi.stubEnv("DOJO_UI_DISABLE_PORTLESS", "");
    return { store, url: `http://dojo.localhost:${proxyPort}`, close: () => new Promise<void>(accept => proxy.close(() => accept())) };
  }

  it("of this build is reused: its URL opens, no server starts and its route stays", async () => {
    const launch = cli();
    const { root, moduleUrl, spawn, log } = launch;
    const running = await runningUi(await startedWith(launch));
    const proxy = await proxyTo(root, running.port);
    try {
      await ui(root, ["--background"], moduleUrl);
      expect(log.mock.calls).toEqual([[`Go to ${proxy.url}`]]);
      // The browser is the one process started
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(spawn.mock.calls[0]![1]).toContain(proxy.url);
      expect(proxy.store.loadRoutes()).toEqual([expect.objectContaining({ hostname: "dojo.localhost", port: running.port, pid: 0 })]);
    } finally { await proxy.close(); await running.close(); }
  });

  it("of this version but an earlier build is replaced by the rebuilt UI", async () => {
    const launch = cli();
    const { root, moduleUrl, spawn } = launch;
    const started = await startedWith(launch);
    const running = await runningUi(started);
    // A rebuild of the same version rewrites the UI the CLI starts
    const entry = join(root, "dist/ui/server/index.mjs");
    writeFileSync(entry, "// rebuilt");
    utimesSync(entry, new Date(), new Date(Date.now() + 60_000));
    const proxy = await proxyTo(root, running.port);
    try {
      await expect(ui(root, ["--background", "--no-open"], moduleUrl)).rejects.toThrow("Could not start the local UI process.");
      expect(spawn).toHaveBeenCalledWith(process.execPath, [entry], expect.objectContaining({ env: expect.objectContaining({ DOJO_UI_VERSION: "1.2.3" }) }));
      expect((spawn.mock.calls[0]![2] as childProcess.SpawnOptions).env!.DOJO_UI_BUILD).not.toBe(started.build);
    } finally { await proxy.close(); await running.close(); }
  });

  it("of another version is replaced by a server that reports this version", async () => {
    const { root, moduleUrl, spawn } = cli();
    const running = await runningUi({ version: "1.2.2" });
    const proxy = await proxyTo(root, running.port);
    try {
      // The mocked server has no PID, so the replacement stops right after it is spawned
      await expect(ui(root, ["--background", "--no-open"], moduleUrl)).rejects.toThrow("Could not start the local UI process.");
      expect(spawn).toHaveBeenCalledWith(process.execPath, [join(root, "dist/ui/server/index.mjs")],
        expect.objectContaining({ env: expect.objectContaining({ DOJO_UI_VERSION: "1.2.3" }) }));
    } finally { await proxy.close(); await running.close(); }
  });

  it("of this build is reused on its direct port, opening this folder's draft by its address and naming its own folder", async () => {
    const launch = cli();
    const { root, moduleUrl, spawn, log } = launch;
    const running = await runningUi(await startedWith(launch));
    // As `dojofoo kyoshi` in a course inside a workspace opens it: the project root is the workspace, the UI's folder the course
    const course = join(root, "courses/draft");
    mkdirSync(course, { recursive: true });
    try {
      await ui(course, ["--authoring", "--no-portless", "--no-open", "--port", String(running.port)], moduleUrl);
      const draft = listWorkspaces({ stateHome: join(root, "home") }).find(workspace => workspace.path === course);
      expect(log.mock.calls).toEqual([[`Go to http://localhost:${running.port}/authoring/${draft!.id}`],
        [`That UI serves ${root}, the folder it was started in.`]]);
      expect(spawn).not.toHaveBeenCalled();
    } finally { await running.close(); }
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
