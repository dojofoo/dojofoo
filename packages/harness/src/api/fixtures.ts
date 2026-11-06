import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { Client } from "@dojofoo/harness/client";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Agent, AgentEndpoint, AgentRuntime, EveDelivery, Persona, SessionRecord } from "./runtime";
import { AgentApiError, firstMessageOf } from "./runtime";
import { agentRow, dojoTags, isAgentId, offeredAgents, type AgentId } from "@dojofoo/protocol";

const fixture = fileURLToPath(new URL("../../test/api/eve/", import.meta.url));

/**
 * A real Eve host running the fixture agent (`test/eve`, a mock model): its replies echo the
 * message, or call a tool ("read"), ask a question ("ask"), or take 30s ("slow").
 */
export async function startEve(): Promise<AgentEndpoint & { close(): Promise<void> }> {
  // A copy per host, outside the package: Eve keeps one development server per project, and its state beside it
  const root = await mkdtemp(join(tmpdir(), "dojo-api-eve-"));
  await cp(fixture, root, { recursive: true, filter: source => !/[/\\](?:\.eve|node_modules)(?:[/\\]|$)/u.test(source) });
  // The fixture agent imports the harness; the copy finds it through its own link, as a managed persona app does
  await mkdir(join(root, "node_modules", "@dojofoo"), { recursive: true });
  await symlink(dirname(createRequire(import.meta.url).resolve("@dojofoo/harness/package.json")), join(root, "node_modules", "@dojofoo", "harness"), "dir");
  // Under NODE_ENV=test (vitest) Eve replaces every authored model with its own mock; the fixture's
  // agent has no sandbox, so its Docker cleanup needn't wait for a Docker daemon that isn't running
  if (process.env.NODE_ENV === "test") process.env.NODE_ENV = "development";
  process.env.EVE_DOCKER_PATH ??= join(root, "no-docker");
  const { createDevelopmentServer } = await import("@dojofoo/harness/server");
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
      before: async (_id, session, delivery) => {
        delivered.push({ phase: "before", sessionId: session.id, delivery });
        const record = records.find(item => item.id === session.id);
        const first = delivery.kind === "message" ? firstMessageOf(delivery.text) : undefined;
        if (record && first && !record.firstMessage) record.firstMessage = first;
        return `handle:${delivered.length}`;
      },
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
      // The page key's newest usable record on the selected agent, as the UI server's; else a create (Kyoshi's with its hidden start
      // turn, so specs keep their greeting; Sensei's bodyless). A draft's page key is (draft, Kyoshi); a Sensei page's (course, lesson).
      openDefault: async (id, request) => {
        known(id);
        const persona = options.persona ?? "kyoshi";
        if (persona === "kyoshi" ? request.course !== undefined || request.lesson !== undefined : request.course === undefined) {
          throw new AgentApiError(400, "invalid_request", "The request does not match this operation's schema.");
        }
        const forPage = (item: SessionRecord) => item.persona === persona
          && (persona === "kyoshi" || (item.courseId === request.course && (item.lessonId ?? "") === (request.lesson ?? "")));
        const usable = (item: SessionRecord) => !item.endedAt && !item.replacedBy;
        const create = async (): Promise<SessionRecord> => {
          const client = new Client(endpoint);
          const { session } = persona === "kyoshi" ? await client.sessions.create({ message: dojoTags.beginAuthoring }) : await client.sessions.create();
          const created: SessionRecord = { id: session.id, agent: selected, persona, createdAt: new Date().toISOString(),
            ...(request.course ? { courseId: request.course } : {}), ...(request.lesson ? { lessonId: request.lesson } : {}), revision: 0 };
          records.push(created);
          return created;
        };
        if (request.new) {
          const from = request.from ? records.find(item => item.id === request.from) : undefined;
          const replacement = from?.replacedBy ? records.find(item => item.id === from.replacedBy) : undefined;
          if (replacement) return { session: replacement, rewrite: true };
          const created = await create();
          if (from) from.replacedBy = created.id;
          return { session: created, rewrite: true };
        }
        const picked = request.session ? records.find(item => item.id === request.session) : undefined;
        if (picked && forPage(picked) && picked.agent === selected && usable(picked)) return { session: picked, rewrite: false };
        // Only a requested record on the selected agent that can't continue is "picked-unavailable"; another agent's still can, after a switch
        const notice = picked && forPage(picked) && picked.agent === selected ? { notice: "picked-unavailable" as const } : {};
        const newest = records.filter(item => forPage(item) && item.agent === selected && usable(item))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
        return { session: newest ?? await create(), rewrite: true, ...notice };
      },
      patch: async (id, sessionId, { model, effort }) => {
        known(id);
        const record = records.find(item => item.id === sessionId);
        if (!record) throw new AgentApiError(404, "session_not_found", "Session not found.");
        if (record.lifecycle?.status === "paused") throw new AgentApiError(409, "turn_paused", "Change the model after Sensei's question is answered.");
        Object.assign(record, { ...(model !== undefined ? { model } : {}), ...(effort !== undefined ? { effort } : {}), revision: (record.revision ?? 0) + 1 });
        return record;
      },
    },
  };
}
