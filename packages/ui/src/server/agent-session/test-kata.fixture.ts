import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { vi } from "vitest";
import type { AgentEndpoint, SessionRecord } from "@dojofoo/agent/api";
import { observeWorkspacePath } from "@dojofoo/config/local-state";
import { createLocalAgentRuntime } from "../agent-api";
import { forgetHost, hostPortServer } from "../host-port";
import { setPageSink, type PageKey, type PageMessage } from "./notify";
import { presence } from "./presence";

/** A learner workspace with a kata course (`starter`, lessons `001-first`, `002-second`) and an interactive one (`tour`),
 *  registered under a temporary DOJOFOO_HOME, and an AgentRuntime whose Sensei host is `eve`. */
export function kataWorkspace(roots: string[], eve: AgentEndpoint, secret = "b".repeat(64)) {
  const root = mkdtempSync(resolve(tmpdir(), "dojo-kata-guard-"));
  roots.push(root);
  vi.stubEnv("DOJOFOO_HOME", resolve(root, "state"));
  vi.stubEnv("CODEX_HOME", resolve(root, "codex"));
  writeFileSync(resolve(root, ".dojorc"), JSON.stringify({ currentDojo: "starter", currentKata: null, editor: null, progress: {} }));
  mkdirSync(resolve(root, ".dojo"), { recursive: true });
  writeFileSync(resolve(root, ".dojo/runtimes.json"), JSON.stringify({ agent: "codex" }));
  const course = resolve(root, ".dojos", "starter");
  for (const [lesson, starter] of [["001-first", "export const answer = 0;\n"], ["002-second", "export const second = 0;\n"]] as const) {
    mkdirSync(resolve(course, "katas", lesson), { recursive: true });
    writeFileSync(resolve(course, "katas", lesson, "SENSEI.md"), `# ${lesson}\n\n## Briefing\nPractice.\n`);
    writeFileSync(resolve(course, "katas", lesson, "solution.ts"), starter);
  }
  writeFileSync(resolve(course, "dojo.yaml"), "name: '@test/starter'\nversion: 1.0.0\ndescription: Katas\ntest: echo ok\nkatas:\n  - name: 001-first\n    template: katas/001-first/solution.ts\n  - name: 002-second\n    template: katas/002-second/solution.ts\n");
  writeFileSync(resolve(course, "DOJO.md"), "Teach carefully.\n");
  const tour = resolve(root, ".dojos", "tour");
  mkdirSync(tour, { recursive: true });
  writeFileSync(resolve(tour, "dojo.json"), JSON.stringify({ mode: "interactive", name: "Tour", version: "0.0.1", description: "Course", lessons: "lesson.json" }));
  writeFileSync(resolve(tour, "lesson.json"), JSON.stringify({ id: "intro", title: "Intro", steps: [{ id: "read", type: "present", title: "Read", content: "Material" }] }));
  const workspaceId = observeWorkspacePath(root, { kind: "learner" });
  const local = createLocalAgentRuntime({ runtime: async () => ({ start: async () => ({ url: eve.baseUrl, secret }), close: async () => {} }) });
  const messages: Array<{ key: PageKey; message: PageMessage }> = [];
  // Every page notification is recorded, and still reaches the page sockets the test opened
  const hub = presence();
  setPageSink((key, message) => { messages.push({ key, message }); hub.send(key, message.method, message.params); return true; });
  const file = resolve(root, "katas", "001-first", "solution.ts");
  // The learner's copy of the first lesson, as its scaffold wrote it
  mkdirSync(resolve(root, "katas", "001-first"), { recursive: true });
  writeFileSync(file, "export const answer = 0;\n");
  const record = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
    id: crypto.randomUUID(), agent: "codex", persona: "sensei", createdAt: new Date().toISOString(), courseId: "starter", lessonId: "001-first", revision: 0,
    lifecycle: { status: "idle", updatedAt: new Date().toISOString() }, ...overrides,
  });
  /** A host-port call as the persona host makes it; the body is read, so work after the answer runs */
  const call = async (method: string, sessionId: string, input: unknown, persona = "sensei") => {
    const response = await hostPortServer(new Request(`http://127.0.0.1/api/host-port/${encodeURIComponent(workspaceId)}/${persona}/${method}`, {
      method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ sessionId, idempotencyKey: crypto.randomUUID(), input }),
    }));
    return { status: response.status, body: await response.json() as unknown };
  };
  const cleanup = () => { setPageSink((key, message) => hub.send(key, message.method, message.params)); forgetHost(workspaceId, "sensei"); forgetHost(workspaceId, "kyoshi"); };
  return { root, workspaceId, local, file, record, call, messages, cleanup, secret };
}

export function removeRoots(roots: string[]) {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}
