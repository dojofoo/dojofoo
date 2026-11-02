import { createRequire } from "node:module";
import { resolveAgentExecutable } from "@dojofoo/config/agent-installations";
import type { HarnessAdapter } from "./adapter";

const require = createRequire(import.meta.url);

/** The ACP bridge uses the learner's installed Claude Code and native login. */
export const claudeHarnessAdapter: HarnessAdapter = {
  kind: "claude",
  contextualInstructions: true,
  supportsVirtualResourceUris: false,
  configureSession: async (connection, sessionId) => { await connection.setSessionMode({ sessionId, modeId: "bypassPermissions" }); return undefined; },
  setModel: async (connection, sessionId, modelId) => {
    const response = await connection.setSessionConfigOption({ sessionId, configId: "model", value: modelId });
    return response.configOptions;
  },
  encodeResource: resource => `<context ref="${resource.uri}">\n${resource.text}\n</context>`,
  process: () => ({
    command: process.execPath,
    args: [require.resolve("@agentclientprotocol/claude-agent-acp/dist/index.js")],
    environment: { ...process.env, CLAUDE_CODE_EXECUTABLE: process.env.CLAUDE_CODE_EXECUTABLE ?? resolveAgentExecutable("claude") ?? "claude" },
  }),
};
