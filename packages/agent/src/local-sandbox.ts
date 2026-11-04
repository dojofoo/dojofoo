import type { HarnessV1NetworkSandboxSession } from "@ai-sdk/harness";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

type Session = HarnessV1NetworkSandboxSession;
type Files = ReturnType<Session["restricted"]>;
type ProcessHandle = Awaited<ReturnType<Files["spawn"]>>;
type WritableProcessHandle = ProcessHandle & { stdin: WritableStream<Uint8Array> };
type SpawnOptions = Parameters<Files["spawn"]>[0];

// Each command leads its own process group, which outlives this process unless
// it kills them on the way out. Eve's server exits on SIGTERM; detached
// harness sessions are still running then.
const groups = new Set<number>();
process.once("exit", () => {
  for (const pid of groups) {
    try { killTree(pid); } catch {}
  }
});

/** SIGKILL a command's group and any group its processes started. OpenCode's
 * bridge runs its server in a group of its own, which it stops only gracefully. */
function killTree(pid: number): void {
  let rows: number[][] = [];
  try {
    rows = execFileSync("ps", ["-axo", "pid=,ppid=,pgid="], { encoding: "utf8" })
      .trim().split("\n").map(line => line.trim().split(/\s+/u).map(Number));
  } catch {}
  const tree = new Set(rows.filter(([, , group]) => group === pid).map(([member]) => member!));
  for (let grown = true; grown;) {
    grown = false;
    for (const [member, parent] of rows) {
      if (!tree.has(member!) && tree.has(parent!)) { tree.add(member!); grown = true; }
    }
  }
  const own = rows.find(([member]) => member === process.pid)?.[2];
  const targets = new Set([pid, ...rows.filter(([member]) => tree.has(member!)).map(([, , group]) => group!)]);
  for (const group of targets) {
    if (group <= 1 || group === own) continue;
    try { process.kill(-group, "SIGKILL"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  }
}

/** Host execution, NOT isolation. Caller owns this session and its lifetime.
 * Course files are never deleted. Absolute paths retain their host meaning.
 * Internal until bridge authentication and native-adapter tests are complete.
 */
export async function createLocalSandbox(
  directory: string,
  options: { id?: string; environment?: NodeJS.ProcessEnv } = {},
): Promise<Session> {
  if (options.id !== undefined && !options.id.trim()) throw new Error("Local sandbox identity must be non-empty.");
  if (process.platform === "win32") throw new Error("Local harness execution currently requires POSIX process groups.");
  if (!isAbsolute(directory)) throw new Error("Local workspace must be an absolute directory.");
  const root = await realpath(directory);
  if (root === dirname(root) || !(await stat(root)).isDirectory()) throw new Error("Local workspace must be a non-root directory.");
  const processes = new Set<ProcessHandle>();
  const environment = { ...(options.environment ?? process.env) };
  let stopping: Promise<void> | undefined;
  const assertRunning = () => {
    if (stopping) throw new Error("Local sandbox has stopped.");
  };
  const path = (value: string) => resolve(root, value);
  const readBinaryFile: Files["readBinaryFile"] = async options => {
    assertRunning();
    options.abortSignal?.throwIfAborted();
    try { return await readFile(path(options.path), { signal: options.abortSignal }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  const writeBinaryFile: Files["writeBinaryFile"] = async options => {
    assertRunning();
    options.abortSignal?.throwIfAborted();
    await mkdir(dirname(path(options.path)), { recursive: true });
    await writeFile(path(options.path), options.content, { signal: options.abortSignal });
  };
  function spawnProcess(options: SpawnOptions & { stdin: true }): Promise<WritableProcessHandle>;
  function spawnProcess(options: SpawnOptions & { stdin?: false }): Promise<ProcessHandle>;
  function spawnProcess(options: SpawnOptions): Promise<ProcessHandle>;
  async function spawnProcess(options: SpawnOptions): Promise<ProcessHandle> {
    assertRunning();
    options.abortSignal?.throwIfAborted();
    const cwd = options.workingDirectory ? path(options.workingDirectory) : root;
    const child = spawn("/bin/sh", ["-c", options.command], {
      cwd,
      // Harness adapters install themselves with pnpm into one folder per machine.
      // pnpm asks before replacing modules another pnpm version built, and a
      // command without a terminal can't answer, so the install fails for good.
      env: { ...environment, ...(cwd.includes("/.ai-sdk-harness/.harness-bootstrap/") ? { CI: "true" } : {}), ...options.env },
      detached: true,
      stdio: [options.stdin ? "pipe" : "ignore", "pipe", "pipe"],
    });
    const completion = new Promise<{ exitCode: number }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => {
        // A CLI can exit after spawning children with redirected stdio. Its
        // closed pipes do not prove that its process group has stopped.
        void reapGroup(child.pid).then(() => {
          if (options.abortSignal?.aborted) reject(options.abortSignal.reason);
          else resolve({ exitCode: code ?? (signal ? 128 : 0) });
        }, reject);
      });
    });
    // A process may fail before the caller asks for wait(). Keep that rejection
    // handled without changing the promise returned to the caller.
    void completion.catch(() => {});
    if (child.pid) groups.add(child.pid);
    let killing: Promise<void> | undefined;
    const handle: ProcessHandle = {
      pid: child.pid,
      stdout: Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
      stderr: Readable.toWeb(child.stderr!) as ReadableStream<Uint8Array>,
      wait: () => completion,
      kill: () => killing ??= (async () => {
        if (!child.pid) return;
        killTree(child.pid);
        // Wait for the process/stdio handles to close, even on cancellation.
        await completion.catch(() => {});
      })(),
    };
    const abort = () => { void Promise.resolve(handle.kill()).catch(() => {}); };
    options.abortSignal?.addEventListener("abort", abort, { once: true });
    processes.add(handle);
    void completion.finally(() => {
      options.abortSignal?.removeEventListener("abort", abort);
      processes.delete(handle);
      if (child.pid) groups.delete(child.pid);
    }).catch(() => {});
    return options.stdin ? { ...handle, stdin: Writable.toWeb(child.stdin!) } : handle;
  }
  const files: Files = {
    description: `Local host workspace: ${root}. Commands run with the user's permissions; this is not an isolation boundary.`,
    readBinaryFile,
    readFile: async options => {
      const bytes = await readBinaryFile(options);
      return bytes === null ? null : new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
    },
    readTextFile: async options => {
      const { startLine = 1, endLine = Infinity } = options;
      if (!Number.isInteger(startLine) || startLine < 1 || endLine < startLine || (endLine !== Infinity && !Number.isInteger(endLine))) {
        throw new Error("Invalid inclusive line range.");
      }
      const bytes = await readBinaryFile(options);
      if (bytes === null) return null;
      const text = new TextDecoder(options.encoding ?? "utf-8").decode(bytes);
      return startLine === 1 && endLine === Infinity ? text : text.split("\n").slice(startLine - 1, endLine).join("\n");
    },
    writeBinaryFile,
    writeFile: async options => {
      const content = new Uint8Array(await new Response(options.content).arrayBuffer());
      await writeBinaryFile({ ...options, content });
    },
    writeTextFile: options => writeBinaryFile({ ...options, content: Buffer.from(options.content, (options.encoding ?? "utf8") as BufferEncoding) }),
    spawn: spawnProcess,
    run: async options => {
      const child = await spawnProcess(options);
      const [result, stdout, stderr] = await Promise.all([
        child.wait(), new Response(child.stdout).text(), new Response(child.stderr).text(),
      ]);
      return { ...result, stdout, stderr };
    },
  };
  const stop = () => stopping ??= Promise.resolve().then(async () => {
    const results = await Promise.allSettled([...processes].map(child => child.kill()));
    const failures = results.filter(result => result.status === "rejected").map(result => result.reason);
    if (failures.length) throw new AggregateError(failures, "Failed to stop local harness processes.");
  });
  const getPortEndpoint: Session["getPortEndpoint"] = async ({ port, protocol = "http" }) => {
    assertRunning();
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local port.");
    return { url: `${protocol}://127.0.0.1:${port}` };
  };
  return {
    ...files,
    id: options.id ?? randomUUID(), defaultWorkingDirectory: root, ports: [],
    getPortEndpoint,
    getPortUrl: async options => (await getPortEndpoint(options)).url,
    restricted: () => files,
    stop, destroy: stop,
  };
}

async function reapGroup(pid: number | undefined): Promise<void> {
  if (!pid) return;
  try { process.kill(-pid, "SIGKILL"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    // macOS answers EPERM for a group whose last process is exiting; observe it below instead
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
  }
  const deadline = Date.now() + 5000;
  let observationError: unknown;
  while (true) {
    try { process.kill(-pid, 0); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
      // A successful SIGKILL is followed by asynchronous kernel reaping.
      // Permission loss during observation is not proof that the group is gone.
      observationError = error;
    }
    if (Date.now() >= deadline) throw new Error(`Local process group ${pid} did not exit after SIGKILL.`, { cause: observationError });
    await delay(20);
  }
}
