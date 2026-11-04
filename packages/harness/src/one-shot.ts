import type { AgentId } from "@dojofoo/protocol";
import { generateText } from "ai";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { agentAdapter, type AgentAdapter } from "./adapters.js";
import { experimental_createHarnessModel } from "./harness-model.js";
import { createLocalHarnessSandbox } from "./local-harness-sandbox.js";
import { readOnlyEnvironment, removeReadOnlyHome } from "./read-only.js";
import { prepareHarnessEnvironment } from "./runtime-toolchain.js";

export interface OneShotRequest {
  agent: AgentId;
  /** Omitted: the agent's default model */
  model?: string;
  /** The role's prompt file (learner, fixture generator), sent as the system prompt; judges send none, their prompt is whole */
  instructions?: string;
  prompt: string;
  /** An empty folder for this call; the native process runs in <directory>/scratch */
  directory: string;
  /** $DOJOFOO_HOME/state: the private read-only home (D34) lives under it; a session-scoped row (Grok) gets one for this call, removed after */
  stateDirectory: string;
  signal: AbortSignal;
  timeoutMs: number;
  /** The base environment; prepareHarnessEnvironment() when omitted */
  environment?: NodeJS.ProcessEnv;
  /** Tests only: the adapter to use instead of agentAdapter(agent, { mode: "read-only" }) */
  adapter?: AgentAdapter;
}

/** One tool-free model turn: generateText over experimental_createHarnessModel in read-only mode, no Eve tools, maxRetries 0.
 *  The native session is stopped when the call settles or aborts. */
export async function oneShot(request: OneShotRequest): Promise<{ text: string }> {
  const { agent, stateDirectory } = request;
  const eveSessionId = `one-shot-${randomUUID()}`;
  const base = request.environment ?? await prepareHarnessEnvironment();
  try {
    await mkdir(join(request.directory, "scratch"), { recursive: true });
    const harness = request.adapter ?? await agentAdapter(agent, { mode: "read-only", environment: base });
    const environment = await readOnlyEnvironment(agent, base, { stateDirectory, eveSessionId });
    const { model } = experimental_createHarnessModel({
      harness,
      sandbox: createLocalHarnessSandbox(request.directory, { environment }),
      sandboxConfig: { workDir: "scratch" },
      ...(request.model ? { model: request.model } : {}),
    }, { mode: "read-only", agent });
    const { text } = await generateText({
      model,
      ...(request.instructions ? { system: request.instructions } : {}),
      prompt: request.prompt,
      abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(request.timeoutMs)]),
      maxRetries: 0,
    });
    return { text };
  } finally {
    await removeReadOnlyHome(agent, { stateDirectory, eveSessionId });
  }
}
