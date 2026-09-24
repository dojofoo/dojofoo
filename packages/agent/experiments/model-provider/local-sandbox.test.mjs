import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createLocalSandbox } from "../../dist/local-sandbox.js";
import { createLocalHarnessSandbox } from "../../dist/local-harness-sandbox.js";

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), "dojo-local-sandbox-"));
  const session = await createLocalSandbox(root);
  t.after(async () => { await session.stop(); await rm(root, { recursive: true, force: true }); });
  return { root, session };
}

test("shared harness factory preserves native identity and initialization", async t => {
  const { root } = await workspace(t);
  const factory = createLocalHarnessSandbox(root, { providerId: "dojo-authoring-local" });
  assert.equal(factory.providerId, "dojo-authoring-local");
  let initialized = 0;
  const session = await factory.createSession({ sessionId: "lesson-one", onFirstCreate: async current => {
    initialized++;
    assert.equal(current.id, "lesson-one");
  } });
  await session.stop();
  const resumed = await factory.resumeSession({ sessionId: session.id });
  t.after(() => resumed.stop());
  assert.equal(resumed.id, session.id);
  assert.equal(initialized, 1);
});

test("shared harness factory rejects cancellation before acquiring a workspace", async () => {
  const factory = createLocalHarnessSandbox("/nonexistent-dojo-fixture");
  const abortSignal = AbortSignal.abort(new Error("Cancelled lesson"));
  await assert.rejects(factory.createSession({ abortSignal }), /Cancelled lesson/);
  assert.throws(() => factory.resumeSession({ sessionId: "lesson-one", abortSignal }), /Cancelled lesson/);
});

test("shared harness initialization errors are not swallowed", async t => {
  const { root } = await workspace(t);
  const factory = createLocalHarnessSandbox(root);
  let child;
  t.after(async () => { await child?.kill(); });
  await assert.rejects(factory.createSession({ onFirstCreate: async session => {
    child = await session.spawn({ command: "sleep 30" });
    throw new Error("Bootstrap failed");
  } }), /Bootstrap failed/);
  assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
});

test("local sandbox preserves caller-owned identity when reattached", async t => {
  const { root } = await workspace(t);
  const first = await createLocalSandbox(root, { id: "harness-session-one" });
  await first.stop();
  const resumed = await createLocalSandbox(root, { id: "harness-session-one" });
  t.after(() => resumed.stop());
  assert.equal(first.id, "harness-session-one");
  assert.equal(resumed.id, first.id);
  await assert.rejects(createLocalSandbox(root, { id: "" }), /non-empty/);
});

test("cleanup requires observed group disappearance after a transient EPERM", async t => {
  const { session } = await workspace(t);
  const child = await session.spawn({ command: "sleep 0.1" });
  const kill = process.kill.bind(process);
  let probes = 0;
  t.mock.method(process, "kill", (pid, signal) => {
    if (pid !== -child.pid) return kill(pid, signal);
    if (signal === "SIGKILL") {
      try { return kill(pid, signal); }
      catch (error) { if (error.code !== "ESRCH") throw error; return true; }
    }
    if (signal === 0 && probes++ === 0) {
      throw Object.assign(new Error("Group is still being reaped"), { code: "EPERM" });
    }
    return kill(pid, signal);
  });
  await Promise.all([child.wait(), new Response(child.stdout).text(), new Response(child.stderr).text()]);
  assert.ok(probes >= 2, "EPERM must not count as successful cleanup");
});

test("local filesystem preserves binary content, absolute paths and course files after stop", async t => {
  const { root, session } = await workspace(t);
  const bytes = Uint8Array.from([0, 128, 255, 10]);
  await session.writeBinaryFile({ path: "nested/data.bin", content: bytes });
  assert.deepEqual(new Uint8Array(await session.readBinaryFile({ path: join(root, "nested/data.bin") })), bytes);
  assert.equal(await session.readBinaryFile({ path: "missing" }), null);
  await session.writeTextFile({ path: "lesson.md", content: "one\ntwo\nthree" });
  assert.equal(await session.readTextFile({ path: "lesson.md", startLine: 2, endLine: 99 }), "two\nthree");
  await assert.rejects(session.readTextFile({ path: "lesson.md", startLine: 0 }), /line range/);
  await session.stop();
  await session.destroy();
  assert.equal(await readFile(join(root, "lesson.md"), "utf8"), "one\ntwo\nthree");
  await assert.rejects(session.run({ command: "true" }), /stopped/);
});

test("real subprocess streams retain non-UTF8 bytes and exit status", async t => {
  const { session } = await workspace(t);
  const child = await session.spawn({ command: "printf '\\000\\200\\377'; printf failure >&2; exit 7" });
  const [out, err, result] = await Promise.all([
    new Response(child.stdout).arrayBuffer(), new Response(child.stderr).text(), child.wait(),
  ]);
  assert.deepEqual(new Uint8Array(out), Uint8Array.from([0, 128, 255]));
  assert.equal(err, "failure");
  assert.equal(result.exitCode, 7);
  assert.deepEqual(await session.run({ command: 'printf "%s" "$DOJO_TEST_VALUE"', env: { DOJO_TEST_VALUE: "selected" } }), {
    exitCode: 0, stdout: "selected", stderr: "",
  });
});

test("abort rejects wait and stop terminates active process groups", { timeout: 5000 }, async t => {
  const { session } = await workspace(t);
  const controller = new AbortController();
  const child = await session.spawn({ command: "sleep 60 & wait", abortSignal: controller.signal });
  const reason = new Error("Cancel local turn");
  controller.abort(reason);
  await assert.rejects(child.wait(), error => error === reason);
  assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
  const other = await session.spawn({ command: "sleep 60 & wait" });
  await session.stop();
  assert.throws(() => process.kill(other.pid, 0), { code: "ESRCH" });
  assert.ok((await other.wait()).exitCode !== 0);
});

test("pre-aborted operations do not execute and restricted view excludes lifecycle", async t => {
  const { session } = await workspace(t);
  const signal = AbortSignal.abort(new Error("Already cancelled"));
  await assert.rejects(session.run({ command: "touch should-not-exist", abortSignal: signal }), /Already cancelled/);
  assert.equal(await session.readBinaryFile({ path: "should-not-exist" }), null);
  assert.equal(session.restricted().stop, undefined);
  assert.equal(session.restricted().getPortEndpoint, undefined);
  assert.deepEqual(await session.getPortEndpoint({ port: 4321, protocol: "ws" }), { url: "ws://127.0.0.1:4321" });
  await assert.rejects(session.getPortEndpoint({ port: 0 }), /Invalid local port/);
});

test("spawn errors reach the caller and do not prevent teardown", async t => {
  const { root, session } = await workspace(t);
  const child = await session.spawn({ command: "true", workingDirectory: join(root, "missing-directory") });
  await assert.rejects(child.wait(), { code: "ENOENT" });
  await session.stop();
});

test("exited shell cannot leave background descendants with redirected stdio", { timeout: 10000 }, async t => {
  const { session } = await workspace(t);
  const child = await session.spawn({ command: "sleep 60 </dev/null >/dev/null 2>&1 & echo $!" });
  const descendant = Number(await new Response(child.stdout).text());
  assert.ok(descendant > 0);
  await child.wait();
  assert.throws(() => process.kill(descendant, 0), { code: "ESRCH" });
  assert.throws(() => process.kill(-child.pid, 0), { code: "ESRCH" });
});

test("local workspace validation rejects broad or ambiguous roots", async () => {
  await assert.rejects(createLocalSandbox("relative"), /absolute directory/);
  await assert.rejects(createLocalSandbox("/"), /non-root directory/);
});

test("explicit subprocess environment replaces inherited values and is snapshotted", async t => {
  const { root } = await workspace(t);
  const environment = { DOJO_TEST_VALUE: "original" };
  const session = await createLocalSandbox(root, { environment });
  t.after(() => session.stop());
  environment.DOJO_TEST_VALUE = "changed";
  const result = await session.run({ command: 'printf "%s:%s" "$DOJO_TEST_VALUE" "${HOME-unset}"' });
  assert.equal(result.stdout, "original:unset");
});

test("official bridge authenticates local clients and shuts down through its protocol", { timeout: 10000 }, async t => {
  const { session } = await workspace(t);
  const token = randomBytes(32).toString("hex");
  const code = `
    import { runBridge } from ${JSON.stringify(import.meta.resolve("@ai-sdk/harness/bridge"))};
    await runBridge({
      bridgeType: "local-sandbox-test", bridgeStateDir: ".bridge-test",
      async onStart() {}, onStop: () => ({ stopped: true }),
    });
  `;
  const child = await session.spawn({
    command: '"$DOJO_NODE" --input-type=module --eval "$DOJO_BRIDGE_CODE"',
    env: { DOJO_NODE: process.execPath, DOJO_BRIDGE_CODE: code, BRIDGE_CHANNEL_TOKEN: token, BRIDGE_WS_PORT: "0" },
  });
  const stderr = new Response(child.stderr).text();
  const output = child.stdout.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (!buffer.includes("\n")) {
    const chunk = await output.read();
    if (chunk.done) assert.fail(`Bridge exited before readiness: ${await stderr}`);
    buffer += chunk.value;
  }
  const ready = JSON.parse(buffer.slice(0, buffer.indexOf("\n")));
  assert.equal(ready.type, "bridge-ready");
  const { url } = await session.getPortEndpoint({ port: ready.port, protocol: "ws" });
  for (const suffix of ["", "?agent_bridge_token=incorrect"]) {
    const socket = new WebSocket(`${url}${suffix}`);
    t.after(() => socket.close());
    const messages = [];
    socket.addEventListener("message", event => messages.push(event.data));
    const closed = await new Promise((resolve, reject) => {
      socket.addEventListener("close", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    assert.equal(closed.code, 1008);
    assert.equal(closed.reason, "unauthorized");
    assert.deepEqual(messages, [], "Unauthorized sockets must not receive session data");
  }
  const socket = new WebSocket(`${url}?agent_bridge_token=${token}`);
  t.after(() => socket.close());
  const stopped = new Promise((resolve, reject) => {
    socket.addEventListener("error", reject, { once: true });
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.type === "bridge-hello") socket.send(JSON.stringify({ type: "stop" }));
      if (message.type === "bridge-stop") resolve(message);
    });
  });
  const receipt = await stopped;
  assert.equal(receipt.type, "bridge-stop");
  assert.deepEqual(receipt.data, { stopped: true });
  assert.equal((await child.wait()).exitCode, 0);
  await output.cancel();
  assert.equal(await stderr, "");
  assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
});
