import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify, stripVTControlCharacters } from "node:util";
import { expect, it } from "vitest";

// Upstream #4593's lifecycle boundary, with no model or harness involved.
it.skipIf(process.platform === "win32").each([false, true])("awaits Nitro close hooks and native owner shutdown (native=%s)", async native => {
  const root = await mkdtemp(join(tmpdir(), "dojo-nitro-close-"));
  const log = join(root, "close.log");
  const load = createRequire(import.meta.url);
  const fixture = fileURLToPath(new URL("./__fixtures__/nitro-close/", import.meta.url));
  const child = spawn(process.execPath, [join(dirname(load.resolve("vite/package.json")), "bin/vite.js"),
    "--host", "127.0.0.1", "--port", "0"], {
    cwd: fixture, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "true", NODE_ENV: "development", DOJO_NITRO_CLOSE_LOG: log,
      DOJO_PROJECT_ROOT: root, DOJO_NITRO_RUNTIME_ROOT: native ? root : "",
      // Exercise the colored readiness output emitted by the CI runner.
      FORCE_COLOR: "1", NO_COLOR: undefined,
      DOJOFOO_HOME: join(root, "home"), DOJO_EVE_ROOT: "", EVE_BASE_URL: "" },
  });
  let output = "";
  const ready = Promise.withResolvers<string>();
  const startup = setTimeout(() => ready.reject(new Error(`Vite startup timed out: ${output}`)), 10_000);
  child.stdout.on("data", data => {
    output += data;
    const url = stripVTControlCharacters(output).match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+\/)/)?.[1];
    if (url) ready.resolve(url);
  });
  child.stderr.on("data", data => { output += data; });
  child.once("error", ready.reject);
  child.once("exit", () => ready.reject(new Error(output)));
  let nativeUrl: string | undefined;
  try {
    const url = await ready.promise;
    clearTimeout(startup);
    const response = await fetch(`${url}api/hello`, { signal: AbortSignal.timeout(30_000) });
    expect(response.ok, output).toBe(true);
    if (native) {
      nativeUrl = (await response.json()).url;
      expect(typeof nativeUrl).toBe("string");
      await fetch(nativeUrl!, { signal: AbortSignal.timeout(2000) });
    } else expect(await response.text(), output).toContain("hello");
    const exited = once(child, "exit", { signal: AbortSignal.timeout(10_000) });
    child.kill("SIGTERM");
    await exited;
    expect((await readFile(log, "utf8")).trim().split("\n"), output).toEqual(expect.arrayContaining(["build:close", "runtime:close"]));
    if (nativeUrl) await expect(fetch(nativeUrl, { signal: AbortSignal.timeout(2000) }))
      .rejects.toMatchObject({ cause: { code: "ECONNREFUSED" } });
  } finally {
    clearTimeout(startup);
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

it.skipIf(process.platform === "win32")("closes production WebSockets before draining the HTTP server", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-nitro-production-close-"));
  const log = join(root, "close.log");
  const load = createRequire(import.meta.url);
  const fixture = fileURLToPath(new URL("./__fixtures__/nitro-close/", import.meta.url));
  const outputDir = join(root, "output");
  const environment = { ...process.env, DOJO_NITRO_CLOSE_LOG: log,
    DOJO_NITRO_RUNTIME_ROOT: "", DOJO_NITRO_BUILD_OUTPUT: outputDir };
  let child: ReturnType<typeof spawn> | undefined;
  let socket: WebSocket | undefined;
  let output = "";
  try {
    await promisify(execFile)(process.execPath, [join(dirname(load.resolve("vite/package.json")), "bin/vite.js"), "build"], {
      cwd: fixture, env: environment, timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
    });
    child = spawn(process.execPath, [join(outputDir, "server/index.mjs")], {
      cwd: fixture, stdio: ["ignore", "pipe", "pipe"],
      env: { ...environment, NODE_ENV: "production", CI: "", TEST: "", PORT: "0", HOST: "127.0.0.1" },
    });
    const ready = Promise.withResolvers<string>();
    const capture = (data: Buffer) => {
      output += data;
      const url = stripVTControlCharacters(output).match(/Listening on:\s+(http:\/\/127\.0\.0\.1:\d+)\/?/)?.[1];
      if (url) ready.resolve(url);
    };
    child.stdout!.on("data", capture);
    child.stderr!.on("data", capture);
    child.once("error", ready.reject);
    child.once("exit", () => ready.reject(new Error(output)));
    const startup = setTimeout(() => ready.reject(new Error(`Production startup timed out: ${output}`)), 10_000);
    let url: string;
    try { url = await ready.promise; }
    finally { clearTimeout(startup); }
    socket = new WebSocket(`${url.replace("http:", "ws:")}/api/socket`);
    await once(socket, "open", { signal: AbortSignal.timeout(10_000) });
    const closed = once(socket, "close", { signal: AbortSignal.timeout(10_000) });
    const exited = once(child, "exit", { signal: AbortSignal.timeout(10_000) });
    child.kill("SIGTERM");
    try {
      await Promise.all([closed, exited]);
    } catch (error) {
      throw new Error(`Shutdown with an open WebSocket failed: ${output}`, { cause: error });
    }
    expect(await readFile(log, "utf8"), output).toContain("runtime:close");
    expect(output).not.toContain("Graceful shutdown timed out");
  } finally {
    socket?.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
    await rm(root, { recursive: true, force: true });
  }
}, 90_000);
