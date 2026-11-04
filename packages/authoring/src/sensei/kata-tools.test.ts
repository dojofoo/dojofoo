import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startHostPortFixture } from "@dojofoo/agent/host-port/fixture";
import { createKataTool } from "./kata-tools.ts";
import { createSenseiContextTool } from "./context-tool.ts";

// The prepared agent's runtime.json, as the Sensei host writes it: the binding points at the test's fixture
const binding = vi.hoisted(() => ({ hostPort: undefined as undefined | { url: string; workspaceId: string; persona: "sensei"; secret: string } }));
vi.mock("../../agents/sensei/runtime.ts", () => ({ runtime: async () => ({ hostPort: binding.hostPort, auth: { username: "u", password: "p" } }) }));

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of closers.splice(0)) await close(); binding.hostPort = undefined; });
const kataContext = { kind: "kata", hash: "h", course: { id: "c", title: "C" }, guidance: "", lesson: { id: "first", source: "# First", fragmentIds: [] },
  context: { phase: "resume", course: { id: "c", completedLessons: [] }, lesson: { id: "first", title: "First", objective: "o", state: "ongoing" },
    learner: { file: { path: "first.ts", language: "typescript", content: "" }, latestCheck: null } }, fileUnchanged: true };

async function port(mode: "katas" | "interactive") {
  const fixture = await startHostPortFixture({ handlers: {
    session: () => ({ courseId: "c", ...(mode === "katas" ? { lessonId: "first" } : {}), mode, revision: 0 }),
    check: () => ({ observationId: "o1", report: { passed: 0, failed: 1, skipped: 0, total: 1, complete: false, tests: [] } }),
    navigate: () => ({ courseId: "c", lessonId: "second" }),
    context: () => kataContext,
  } });
  closers.push(fixture.close);
  binding.hostPort = { url: fixture.url, workspaceId: "w1", persona: "sensei", secret: "s" };
  return fixture;
}
const memo = () => {
  const saved = new Map<string, unknown>();
  return async (key: unknown, run: () => Promise<unknown>) => {
    const id = JSON.stringify(key);
    if (!saved.has(id)) saved.set(id, await run());
    return saved.get(id);
  };
};
const resolve = (tool: object, ctx: object) => (tool as Record<symbol, (ctx: object) => Promise<unknown>>)[Symbol.for("eve.dynamic")]!(ctx);
const runtime = async () => ({ hostPort: binding.hostPort });

describe("kata tools", () => {
  it("kata tools are left out for interactive courses", async () => {
    await port("interactive");
    for (const kind of ["check", "observe", "show"] as const) expect(await resolve(createKataTool(runtime, kind), { session: { id: "s1" }, memo: memo() })).toBeNull();
    const kata = await port("katas");
    const check = await resolve(createKataTool(runtime, "check"), { session: { id: "s2" }, memo: memo() }) as { execute(input: object, ctx: object): Promise<unknown> };
    expect(check).not.toBeNull();
    expect(await check.execute({}, { session: { id: "s2" }, callId: "call-1" })).toMatchObject({ observationId: "o1" });
    expect(kata.calls.filter(call => call.method === "check").map(call => call.idempotencyKey)).toEqual(["s2:call-1"]);
  });

  it("complete asks the completion question and navigates once on Move on", async () => {
    const fixture = await port("katas");
    const { default: complete } = await import("../../agents/sensei/tools/dojo_lesson_complete.ts") as unknown as { default: { execute(input: object, ctx: object): Promise<unknown> } };
    const asked: unknown[] = [];
    const ctx = (optionId: string) => ({ session: { id: "s3" }, callId: `call-${optionId}`, ask: async (question: unknown) => { asked.push(question); return { status: "answered", optionId }; } });
    expect(await complete.execute({}, ctx("review"))).toEqual({ decision: "Review" });
    expect(await complete.execute({}, ctx("move-on"))).toEqual({ decision: "Move on", next: { courseId: "c", lessonId: "second" } });
    expect(asked[0]).toMatchObject({ prompt: "What would you like to do next?", options: [{ id: "review", label: "Review" }, { id: "move-on", label: "Move on" }, { id: "pause", label: "Pause" }] });
    expect(fixture.calls.filter(call => call.method === "navigate").map(call => call.idempotencyKey)).toEqual(["s3:call-move-on:navigate"]);
    await port("interactive");
    expect(await complete.execute({}, ctx("move-on"))).toEqual({ unavailable: "Interactive courses have no completion question." });
    expect(asked).toHaveLength(2);
  });

  it("complete's mode lookup runs in a step", () => {
    const source = readFileSync(new URL("../../agents/sensei/tools/dojo_lesson_complete.ts", import.meta.url), "utf8");
    const body = source.slice(source.indexOf('"use workflow"'), source.indexOf("async function sessionMode"));
    expect(body).not.toMatch(/port\.call|runtime\(|fetch\(/u);
    for (const step of ["sessionMode", "navigateNext"]) expect(source).toMatch(new RegExp(`async function ${step}\\([^)]*\\)[^{]*\\{\\s*"use step";`, "u"));
  });

  it("an unchanged kata file reads as unchanged, not as an empty file", async () => {
    await port("katas");
    const tool = createSenseiContextTool(runtime) as unknown as { execute(input: object, ctx: object): Promise<unknown> };
    const result = await tool.execute({}, { session: { id: "s4" }, callId: "call-1" });
    expect(result).toEqual(expect.stringContaining("The learner's file is unchanged since you last read it."));
    expect(result).not.toEqual(expect.stringContaining("L1:"));
  });
});
