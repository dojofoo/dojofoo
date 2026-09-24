import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalCursor } from "./local-cursor";
import { HarnessAgent } from "@dojofoo/agent/harness";
import { createLocalSandbox } from "@dojofoo/agent/experimental/local";
import { expect, it } from "vitest";

// Explicit consent required: Cursor routes these requests through the user's
// existing subscription. Never include this in the normal/offline matrix.
it.skipIf(process.env.DOJO_CURSOR_ACCEPTANCE !== "1")("Cursor live streaming, recovery and cancellation (three turns; optional fourth model-switch turn, no retries)", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-cursor-acceptance-")));
  await mkdir(join(root, "course"));
  const sandbox = await createLocalSandbox(root);
  const harness = createLocalCursor();
  // Cursor's ACP catalog calls Auto "default"; its terminal --model calls it
  // "auto". Use the advertised ACP value, not the terminal flag's alias.
  const agent = new HarnessAgent({ harness, model: process.env.DOJO_CURSOR_MODEL ?? "default", sandboxConfig: { workDir: "course" } });
  try {
    const session = await agent.createSession({ sandboxSession: sandbox, abortSignal: AbortSignal.timeout(60_000) });
    const stream = await agent.stream({ session,
      prompt: "Do not use tools. Remember the codeword cedar-482. Reply only: Ready cedar-482",
      abortSignal: AbortSignal.timeout(60_000) });
    const chunks: string[] = [];
    for await (const chunk of stream.fullStream) {
      if (chunk.type === "error") throw chunk.error;
      if (chunk.type === "text-delta") chunks.push(chunk.text);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("")).toContain("cedar-482");
    console.info("Cursor acceptance: streaming passed");
    const checkpoint = JSON.parse(JSON.stringify(await session.stop()));
    const resumed = await agent.createSession({ sandboxSession: sandbox, sessionId: session.sessionId,
      resumeFrom: checkpoint, abortSignal: AbortSignal.timeout(60_000) });
    const recovered = await agent.generate({ session: resumed, prompt: "Do not use tools. Reply only with the codeword I asked you to remember.",
      abortSignal: AbortSignal.timeout(60_000) });
    expect(recovered.text).toContain("cedar-482");
    expect(resumed.sessionId).toBe(session.sessionId);
    console.info("Cursor acceptance: persisted history passed");
    // Free plans support Auto only. Named-model switching is a separate gate,
    // never claimed as passed when it was not exercised.
    const secondModel = process.env.DOJO_CURSOR_SECOND_MODEL;
    if (secondModel) {
      const switchedAgent = new HarnessAgent({ harness, model: secondModel, sandboxConfig: { workDir: "course" } });
      const switched = await switchedAgent.generate({ session: resumed,
        prompt: "Do not use tools. Reply only with the remembered codeword again.", abortSignal: AbortSignal.timeout(60_000) });
      expect(switched.text).toContain("cedar-482");
      console.info("Cursor acceptance: model selection accepted with history intact; provider-side model identity not asserted");
    }
    await expect(resumed.compact()).rejects.toMatchObject({ name: "AI_HarnessCapabilityUnsupportedError" });
    const cancellation = new AbortController();
    const pending = await agent.stream({ session: resumed,
      prompt: "Do not use tools. Write the numbers 1 through 200, one number per line, without commentary.",
      abortSignal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(60_000)]) });
    let received = false;
    let aborted = false;
    for await (const chunk of pending.fullStream) {
      if (chunk.type === "abort") aborted = true;
      if (chunk.type === "error") throw chunk.error;
      if (chunk.type === "text-delta") {
        received = true;
        cancellation.abort(new Error("Cancelled by acceptance test"));
      }
    }
    expect(received).toBe(true);
    expect(cancellation.signal.aborted).toBe(true);
    expect(aborted).toBe(true);
    console.info("Cursor acceptance: cancellation confirmed during streamed output");
    await resumed.stop();
  } finally {
    await sandbox.stop();
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}, 300_000);
