import { createRequire } from "node:module";
import type { HarnessAdapter } from "./adapter";

const require = createRequire(import.meta.url);

export function codexRuntimeEnvironment(
  developerInstructions: string,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  let configured: Record<string, unknown> = {};
  const serialized = baseEnvironment.CODEX_CONFIG;
  if (serialized) {
    const parsed = JSON.parse(serialized) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("CODEX_CONFIG must contain a JSON object");
    }
    configured = parsed as Record<string, unknown>;
  }
  return {
    ...baseEnvironment,
    // Use the learner's installed CLI, as model discovery and native login do.
    // ACP otherwise launches its separately pinned, potentially older Codex.
    CODEX_PATH: baseEnvironment.CODEX_PATH ?? "codex",
    INITIAL_AGENT_MODE: "agent-full-access",
    CODEX_CONFIG: JSON.stringify({
      ...configured,
      sandbox_mode: "danger-full-access",
      approval_policy: "never",
      developer_instructions: developerInstructions,
    }),
  };
}

export function createCodexHarnessAdapter(environment: NodeJS.ProcessEnv = process.env): HarnessAdapter {
  return {
    kind: "codex",
    // codex-acp's existing Air extension returns terminal failures as typed
    // metadata instead of presenting provider errors as assistant messages.
    clientCapabilities: {
      _meta: {
        jetbrains: { air: { version: 1, capabilities: ["sessionFailure"] } },
        // Codex 2.x sends command output as chunks only when AIR clients opt in.
        // The ACP projection appends these chunks, including JSON lesson checks.
        terminal_output_delta: true,
      },
    },
    validatePromptResponse: (response) => {
      const meta = response._meta as {
        jetbrains?: { air?: { sessionFailure?: { severity?: string; title?: string } } };
      } | undefined;
      const failure = meta?.jetbrains?.air?.sessionFailure;
      if (failure?.severity === "error") {
        throw new Error(`Codex: ${failure.title ?? "Provider failed to complete the turn"}`);
      }
    },
    configureSession: async () => undefined,
    setModel: async (connection, sessionId, modelId) => {
      const response = await connection.setSessionConfigOption({ sessionId, configId: "model", value: modelId });
      return response.configOptions;
    },
    encodeResource: (resource) => resource.text,
    process: (runtime) => ({
      command: process.execPath,
      args: [require.resolve("@agentclientprotocol/codex-acp")],
      environment: codexRuntimeEnvironment(runtime.developerInstructions, environment),
    }),
  };
}

export const codexHarnessAdapter = createCodexHarnessAdapter();
