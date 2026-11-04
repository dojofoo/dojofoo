import type { HarnessAdapter, HarnessKind, HarnessProcess } from "./adapter";
import { resolveAgentExecutable } from "@dojofoo/config/agent-installations";

type NativeAcpOptions = {
  kind: Exclude<HarnessKind, "codex" | "opencode">;
  process: (runtime: { root: string; developerInstructions: string }) => Omit<HarnessProcess, "environment">;
  environment?: NodeJS.ProcessEnv;
  contextualInstructions?: boolean;
  supportsVirtualResourceUris?: boolean;
};

function encodePromptResource(resource: { uri: string; text: string }): string {
  return `<context ref="${resource.uri}">\n${resource.text}\n</context>`;
}

export function createNativeAcpHarnessAdapter(options: NativeAcpOptions): HarnessAdapter {
  return {
    kind: options.kind,
    contextualInstructions: options.contextualInstructions,
    supportsVirtualResourceUris: options.supportsVirtualResourceUris,
    configureSession: async () => undefined,
    setModel: async (connection, sessionId, modelId) => {
      const response = await connection.setSessionConfigOption({ sessionId, configId: "model", value: modelId });
      return response.configOptions;
    },
    encodeResource: encodePromptResource,
    process: (runtime) => ({
      ...options.process(runtime),
      environment: options.environment ?? process.env,
    }),
  };
}

export const cursorHarnessAdapter = createNativeAcpHarnessAdapter({
  kind: "cursor",
  contextualInstructions: true,
  process: () => ({ command: resolveAgentExecutable("cursor") ?? "cursor-agent", args: ["--yolo", "--trust", "acp"] }),
});

export const grokHarnessAdapter = createNativeAcpHarnessAdapter({
  kind: "grok",
  process: ({ developerInstructions }) => ({
    command: resolveAgentExecutable("grok") ?? "grok",
    args: [
      "--rules",
      developerInstructions,
      "--permission-mode",
      "bypassPermissions",
      "agent",
      "stdio",
    ],
  }),
});

export const fxHarnessAdapter = createNativeAcpHarnessAdapter({
  kind: "fx",
  contextualInstructions: true,
  // FX advertises embedded context but treats non-file resource URIs as
  // unsafe workspace targets. Preserve virtual Dojofoo context as ACP text.
  supportsVirtualResourceUris: false,
  environment: { ...process.env, FX_PERMISSION_MODE: "yolo" },
  process: () => ({ command: resolveAgentExecutable("fx") ?? "fx", args: ["acp"] }),
});
