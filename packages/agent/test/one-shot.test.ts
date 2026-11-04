import { existsSync } from "node:fs";
import { mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentAdapter } from "../src/adapters.ts";
import { oneShot, type OneShotRequest } from "../src/one-shot.ts";
import { fakeHarness, reply } from "./fake-harness.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const temporary = async () => { const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-one-shot-"))); roots.push(root); return root; };
const claudeBuiltins = { read: "Read", write: "Write", bash: "Bash" };

async function request(native: ReturnType<typeof fakeHarness>, overrides: Partial<OneShotRequest> = {}): Promise<OneShotRequest> {
  const root = await temporary();
  return {
    agent: "claude", prompt: "Answer as the learner.", directory: join(root, "call"), stateDirectory: join(root, "state"),
    signal: new AbortController().signal, timeoutMs: 10_000, environment: { HOME: join(root, "home"), PATH: process.env.PATH },
    adapter: native.harness as unknown as AgentAdapter, ...overrides,
  };
}

/** Records each native turn's settings and every session a harness stopped or destroyed. */
function observed(native: ReturnType<typeof fakeHarness>) {
  const turns: Array<{ instructions?: unknown; tools?: unknown }> = [];
  const ended: string[] = [];
  const start = native.harness.doStart.bind(native.harness);
  native.harness.doStart = async options => {
    const session = await start(options);
    return { ...session,
      async doPromptTurn(turn: Parameters<typeof session.doPromptTurn>[0] & { instructions?: unknown; tools?: unknown }) {
        turns.push({ instructions: turn.instructions, tools: turn.tools });
        return session.doPromptTurn(turn);
      },
      async doStop() { ended.push(`stop:${session.sessionId}`); return session.doStop(); },
      async doDestroy() { ended.push(`destroy:${session.sessionId}`); return session.doDestroy(); } };
  };
  return { turns, ended };
}

describe("oneShot", () => {
  it("one-shot returns the model's text and offers no tool beyond the agent's read-only built-ins", async () => {
    const prompts: string[] = [];
    const native = fakeHarness({ builtins: claudeBuiltins, script: turn => { prompts.push(turn.prompt); reply(turn.emit, "I am not sure what a reducer is."); } });
    const { turns, ended } = observed(native);
    const result = await oneShot(await request(native, { instructions: "You are a struggling learner." }));
    expect(result).toEqual({ text: "I am not sure what a reducer is." });
    expect(prompts).toEqual(["Answer as the learner."]);
    expect(native.starts).toHaveLength(1);
    expect(native.starts[0]).toMatchObject({ permissionMode: "allow-reads", builtinToolFiltering: { mode: "allow", toolNames: ["read"] } });
    expect(turns).toHaveLength(1);
    expect(turns[0]!.instructions).toBe("You are a struggling learner.");
    expect(Object.keys(turns[0]!.tools ?? {})).toEqual([]);
    expect(ended).toHaveLength(1);
  });

  it("one-shot aborts at its time limit and stops the harness session", async () => {
    // A turn that never finishes
    const native = fakeHarness({ builtins: claudeBuiltins, script: turn => { turn.emit({ type: "text-start", id: "t" }); } });
    const { ended } = observed(native);
    const started = Date.now();
    await expect(oneShot(await request(native, { timeoutMs: 200 }))).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(native.starts).toHaveLength(1);
    expect(ended.length).toBeGreaterThan(0);
  });

  it("one-shot removes Grok's per-call home and leaves a shared home alone", async () => {
    const grok = await request(fakeHarness({ builtins: { read_file: "read_file", list_dir: "list_dir", grep: "grep", search_tool: "search_tool", use_tool: "use_tool" } }), { agent: "grok" });
    await oneShot(grok);
    expect(await readdir(join(grok.stateDirectory, "read-only-homes/grok/sessions"))).toEqual([]);
    const opencode = await request(fakeHarness({ builtins: { read: "view", glob: "glob", grep: "grep" } }), { agent: "opencode" });
    await oneShot(opencode);
    expect(existsSync(join(opencode.stateDirectory, "read-only-homes/opencode"))).toBe(true);
  });
});
