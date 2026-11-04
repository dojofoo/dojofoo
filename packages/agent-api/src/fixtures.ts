import { cp, mkdir, rm } from "node:fs/promises";
import { Client } from "@dojofoo/agent/client";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Agent, AgentEndpoint, AgentRuntime, EveDelivery, Persona, SessionRecord } from "./runtime";
import { AgentApiError } from "./runtime";
import { agentRow, isAgentId, offeredAgents, type AgentId } from "@dojofoo/protocol";

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

/** The launch token the test runtime's pages are served (browser specs mock `GET /api/control/launch-token` with it). */
export const testLaunchToken = "test-launch-token";

/** A runtime with one draft workspace (Kyoshi unless `options.persona` says otherwise) whose selected coding agent is
 * `options.agent` (Codex), served by `endpoint`. `select` switches it and records each selection. */
export function testRuntime(endpoint: AgentEndpoint, workspaceId = "ws-1", options: { persona?: Persona; agent?: AgentId } = {}): AgentRuntime & {
  records: SessionRecord[]; started: string[]; selections: string[];
  /** Each delivery the proxy reported, before and after Eve answered it */
  delivered: Array<{ phase: "before" | "after"; sessionId: string; delivery: EveDelivery; status?: number; deliveryId?: string; handle?: unknown }>;
  /** Presence currently held, by kind */
  presence: { request: number; stream: number };
} {
  const records: SessionRecord[] = [];
  const delivered: Array<{ phase: "before" | "after"; sessionId: string; delivery: EveDelivery; status?: number; deliveryId?: string; handle?: unknown }> = [];
  const presence = { request: 0, stream: 0 };
  const started: string[] = [];
  const selections: string[] = [];
  let selected: AgentId = options.agent ?? "codex";
  const known = (id: string) => { if (id !== workspaceId) throw new AgentApiError(404, "workspace_not_found", "Workspace not found."); };
  const describe = (id: AgentId): Agent => ({ id, name: agentRow(id).name, selected: id === selected, status: id === selected && started.includes(id) ? "ready" : "stopped" });
  const agents = (): Agent[] => [selected, ...offeredAgents().map(row => row.id).filter(id => id !== selected)].map(describe);
  return {
    records, started, selections, delivered, presence,
    deliveries: {
      before: async (_id, session, delivery) => { delivered.push({ phase: "before", sessionId: session.id, delivery }); return `handle:${delivered.length}`; },
      after: async (_id, session, delivery, outcome) => { delivered.push({ phase: "after", sessionId: session.id, delivery, ...outcome }); },
    },
    activity: (_id, kind) => {
      presence[kind]++;
      let released = false;
      return () => { if (!released) { released = true; presence[kind]--; } };
    },
    agents: async id => { known(id); return agents(); },
    start: async (id, agentId) => {
      known(id);
      if (agentId !== selected) throw new AgentApiError(409, "agent_unavailable", "Only the selected coding agent can start.");
      started.push(agentId);
      return { ...describe(selected), status: "starting" };
    },
    stop: async (id, agentId) => { known(id); return { ...agents().find(agent => agent.id === agentId)!, status: "stopped" }; },
    connect: async id => { known(id); return endpoint; },
    select: async (id, agentId) => {
      known(id);
      if (!isAgentId(agentId)) throw new AgentApiError(404, "agent_not_found", "This workspace has no such coding agent.");
      if (!offeredAgents().some(row => row.id === agentId)) throw new AgentApiError(409, "agent_not_offered", `${agentRow(agentId).name} isn't available yet. Choose another coding agent.`);
      selections.push(agentId);
      selected = agentId;
      return describe(agentId);
    },
    persona: async id => { known(id); return options.persona ?? "kyoshi"; },
    models: async (id, agentId) => {
      known(id);
      if (!isAgentId(agentId)) throw new AgentApiError(404, "agent_not_found", "This workspace has no such coding agent.");
      return [{ id: "fixture-model", name: "Fixture model", efforts: [] }];
    },
    sessions: {
      list: async id => { known(id); return records; },
      get: async (id, sessionId) => { known(id); return records.find(item => item.id === sessionId); },
      save: async (id, session) => { known(id); records.push(session); },
      update: async (id, sessionId, change) => {
        known(id);
        const index = records.findIndex(item => item.id === sessionId);
        if (index < 0) throw new AgentApiError(404, "session_not_found", "Session not found.");
        records[index] = change({ ...records[index]!, revision: records[index]!.revision ?? 0 });
        return records[index]!;
      },
      // The newest record for the course, or one made with a bodyless create on the endpoint
      openDefault: async (id, request) => {
        known(id);
        const newest = records.filter(item => item.courseId === request.course && !request.new)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
        if (newest) return { session: newest, rewrite: newest.id !== request.session };
        const { session } = await new Client(endpoint).sessions.create();
        const created: SessionRecord = { id: session.id, agent: selected, persona: options.persona ?? "kyoshi", createdAt: new Date().toISOString(),
          courseId: request.course, ...(request.lesson ? { lessonId: request.lesson } : {}), revision: 0 };
        records.push(created);
        return { session: created, rewrite: true };
      },
      patch: async (id, sessionId, { model }) => {
        known(id);
        const record = records.find(item => item.id === sessionId);
        if (!record) throw new AgentApiError(404, "session_not_found", "Session not found.");
        if (record.lifecycle?.status === "paused") throw new AgentApiError(409, "turn_paused", "Change the model after Sensei's question is answered.");
        Object.assign(record, { model, revision: (record.revision ?? 0) + 1 });
        return record;
      },
    },
  };
}
