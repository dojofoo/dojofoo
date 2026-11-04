import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Agent, AgentEndpoint, AgentRuntime, Persona, SessionRecord } from "./runtime";
import { AgentApiError } from "./runtime";

const fixture = fileURLToPath(new URL("../test/eve/", import.meta.url));

/**
 * A real Eve host running the fixture agent (`test/eve`, a mock model): its replies echo the
 * message, or call a tool ("read"), ask a question ("ask"), or take 30s ("slow").
 */
export async function startEve(): Promise<AgentEndpoint & { close(): Promise<void> }> {
  // A copy per host: Eve keeps one development server per project, and its state beside it
  const root = join(fixture, "..", ".runs", crypto.randomUUID());
  await mkdir(root, { recursive: true });
  await cp(fixture, root, { recursive: true, filter: source => !/[/\\](?:\.eve|node_modules)(?:[/\\]|$)/u.test(source) });
  // Under NODE_ENV=test (vitest) Eve replaces every authored model with its own mock; the fixture's
  // agent has no sandbox, so its Docker cleanup needn't wait for a Docker daemon that isn't running
  if (process.env.NODE_ENV === "test") process.env.NODE_ENV = "development";
  process.env.EVE_DOCKER_PATH ??= join(root, "no-docker");
  const { createDevelopmentServer } = await import("@dojofoo/agent/server");
  const server = createDevelopmentServer(root, { host: "127.0.0.1", port: 0, existing: "reject" });
  const { url } = await server.start();
  return {
    baseUrl: url,
    async close() {
      await server.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** A runtime with one draft workspace (Kyoshi unless `options.persona` says otherwise) whose selected coding agent is Codex, served by `endpoint`. */
export function testRuntime(endpoint: AgentEndpoint, workspaceId = "ws-1", options: { persona?: Persona } = {}): AgentRuntime & { records: SessionRecord[]; started: string[] } {
  const records: SessionRecord[] = [];
  const started: string[] = [];
  const known = (id: string) => { if (id !== workspaceId) throw new AgentApiError(404, "workspace_not_found", "Workspace not found."); };
  const agents = (): Agent[] => [
    { id: "codex", name: "Codex", selected: true, status: started.includes("codex") ? "ready" : "stopped" },
    { id: "opencode", name: "OpenCode", selected: false, status: "stopped" },
  ];
  return {
    records, started,
    agents: async id => { known(id); return agents(); },
    start: async (id, agentId) => {
      known(id);
      if (agentId !== "codex") throw new AgentApiError(409, "agent_unavailable", "Only the selected coding agent can start.");
      started.push(agentId);
      return { ...agents()[0]!, status: "starting" };
    },
    stop: async (id, agentId) => { known(id); return { ...agents().find(agent => agent.id === agentId)!, status: "stopped" }; },
    connect: async id => { known(id); return endpoint; },
    greeting: (persona: Persona) => `Hello ${persona}`,
    persona: async id => { known(id); return options.persona ?? "kyoshi"; },
    sessions: {
      list: async id => { known(id); return records; },
      get: async (id, sessionId) => { known(id); return records.find(item => item.id === sessionId); },
      save: async (id, session) => { known(id); records.push(session); },
    },
  };
}
