import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageChannel, Worker } from "node:worker_threads";
import { test } from "node:test";
import { createLocalSandbox } from "../../dist/local-sandbox.js";
import { exposeLocalProcessHost, connectLocalProcessHost, registerLocalProcessHost, requestLocalProcessHost } from "../../dist/local-process-host.js";

test("parent process host survives worker death and reaps its native process on shutdown", { timeout: 10000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "dojo-process-host-"));
  const session = await createLocalSandbox(root);
  t.after(async () => { await session.stop(); await rm(root, { recursive: true, force: true }); });
  const owner = registerLocalProcessHost(session);
  t.after(() => owner.close());
  const source = `
    const { parentPort, workerData } = require("node:worker_threads");
    (async () => {
      const { requestLocalProcessHost } = await import(${JSON.stringify(new URL("../../dist/local-process-host.js", import.meta.url).href)});
      const host = await requestLocalProcessHost(workerData);
      const child = await host.spawn({ command: "printf READY; sleep 60" });
      const reader = child.stdout.getReader();
      const first = await reader.read();
      parentPort.postMessage({ pid: child.pid, text: new TextDecoder().decode(first.value) });
    })().catch(error => { throw error; });
  `;
  const worker = new Worker(source, { eval: true, workerData: owner.connection });
  t.after(() => worker.terminate());
  const [{ pid, text }] = await Promise.race([
    once(worker, "message"),
    once(worker, "exit").then(([code]) => { throw new Error(`Worker exited before its process was ready: ${code}`); }),
  ]);
  assert.equal(text, "READY");
  await worker.terminate();
  assert.equal(process.kill(-pid, 0), true);
  await owner.close();
  assert.throws(() => process.kill(-pid, 0), { code: "ESRCH" });
  await assert.rejects(requestLocalProcessHost(owner.connection), /no longer available/);
});

test("process host preserves stream bytes, exit status and cancellation", { timeout: 10000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "dojo-process-host-"));
  const session = await createLocalSandbox(root);
  const { port1, port2 } = new MessageChannel();
  t.after(async () => { await session.stop(); port1.close(); port2.close(); await rm(root, { recursive: true, force: true }); });
  exposeLocalProcessHost(session, port1);
  const host = connectLocalProcessHost(port2);
  const child = await host.spawn({ command: "printf out; printf err >&2; exit 7" });
  assert.deepEqual(await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.wait()]), ["out", "err", { exitCode: 7 }]);
  await child.kill();
  const controller = new AbortController();
  const waiting = await host.spawn({ command: "sleep 60", abortSignal: controller.signal });
  const reason = new Error("Cancel native process");
  controller.abort(reason);
  await assert.rejects(waiting.wait(), error => error === reason);
  assert.throws(() => process.kill(-waiting.pid, 0), { code: "ESRCH" });
});
