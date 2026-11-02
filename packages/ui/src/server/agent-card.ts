import type { AgentCard } from "@a2a-js/sdk";

/**
 * Agent Card for the dojo daemon. Served at /.well-known/agent-card.json.
 *
 * For v1 we advertise one skill. As we wire each harness adapter
 * (opencode, agy, codex, …) we add a skill per harness with its own
 * `id` so clients can target a specific agent.
 */
export function buildAgentCard(opts: { baseUrl: string }): AgentCard {
  return {
    name: "dojo",
    description:
      "dojo agent broker — drive a coding-dojo session from a web UI, " +
      "backed by the user's coding agent of choice.",
    url: `${opts.baseUrl}/api/a2a/jsonrpc`,
    protocolVersion: "0.3.0",
    version: "0.0.1",
    provider: { organization: "dojocho", url: opts.baseUrl },
    capabilities: {
      streaming: false, // toggled on once SSE through Nitro is verified
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
    skills: [
      {
        id: "echo",
        name: "Echo (POC)",
        description:
          "Stub skill that echoes the user's message. Replaced by per-harness skills (opencode, agy, codex, …) as adapters land.",
        tags: ["dojo", "poc"],
        examples: ["hello", "what is a kata?"],
      },
    ],
    preferredTransport: "JSONRPC",
    additionalInterfaces: [
      // REST + gRPC interfaces can be added once the corresponding handlers
      // are wired.
    ],
  };
}
