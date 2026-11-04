import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dojoDir, readDojoRc } from "@dojofoo/config";
import { listWorkspaces } from "@dojofoo/config/local-state";
import * as preparation from "@dojofoo/config/project-preparation";
import { scaffoldAuthoringWorkspace } from "@dojofoo/authoring/scaffold";
import { createAuthoringLesson } from "@dojofoo/authoring/service";
import { readTeachingEvidence } from "@dojofoo/authoring/evaluation/run";
import type { LearnerFixture } from "@dojofoo/authoring/evaluation/learner-fixtures";
import { addNotice } from "../agent-session/guard-store";
import { solutionPath, type CheckObservation } from "../lesson/service";
import type { TrialChannel, TrialTurn } from "./channel";
import { httpChannel } from "./channel";
import type { TrialRoles } from "./roles";
import { runTrial } from "./trial";

// The lesson checks run through the CLI; each test scripts its answer from the lesson file's content
vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});

const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const fixture: LearnerFixture = {
  uncertainty: "What does a running value remember?", terminology: "What does initialization mean here?",
  misconception: "Empty means zero", wrong: "export const value = 'WRONG';\n", solved: "export const value = 'SOLVED';\n", review: "Why choose this empty case?",
};

/** A managed draft with `count` kata lessons, under a private DOJOFOO_HOME and TMPDIR */
function draft(count = 1) {
  const directory = mkdtempSync(resolve(tmpdir(), "dojo-trial-"));
  directories.push(directory);
  vi.stubEnv("DOJOFOO_HOME", resolve(directory, "state"));
  vi.stubEnv("TMPDIR", directory);
  vi.stubEnv("DOJOFOO_EVAL_TURN_INTERVAL_MS", "0");
  const root = resolve(directory, "draft");
  scaffoldAuthoringWorkspace({ root, name: "Trial course", style: "katas" });
  const manifest = parse(readFileSync(resolve(root, "dojo.yaml"), "utf8"));
  manifest.description = "Practice a running value.";
  writeFileSync(resolve(root, "dojo.yaml"), stringify(manifest));
  const lessonIds = Array.from({ length: count }, (_, index) => createAuthoringLesson(root, `Lesson ${index + 1}`));
  writeFileSync(resolve(root, ".dojo/runtimes.json"), JSON.stringify({ agent: "opencode", models: { opencode: "openai/gpt-4o" } }));
  return { root, lessonIds, evidenceRoot: mkdtempSync(resolve(directory, "evidence-")) };
}

/** The CLI's check answers by the lesson file: a SOLVED file passes both tests, anything else fails one */
function scriptedChecks(override?: (content: string) => string | undefined) {
  vi.spyOn(preparation, "prepareWorkspace").mockResolvedValue(undefined as never);
  vi.mocked(execFileSync).mockImplementation(((_command: string, args: string[], options: { cwd: string }) => {
    const at = args.indexOf("kata");
    const lessonId = args[at + 1]!;
    const courseId = args[args.indexOf("--course") + 1]!;
    const path = solutionPath(options.cwd, courseId, lessonId);
    const content = existsSync(path) ? readFileSync(path, "utf8") : "";
    const solved = override?.(content) ?? (content.includes("SOLVED") ? "solved" : "wrong");
    return JSON.stringify(solved === "solved"
      ? { total: 2, passed: 2, failed: 0, tests: [{ name: "a", status: "passed" }, { name: "b", status: "passed" }], error: null }
      : { total: 2, passed: 1, failed: 1, tests: [{ name: "a", status: "passed" }, { name: "b", status: "failed" }], error: null });
  }) as never);
}

const text = (delta: string, outcome: TrialTurn["outcome"] = "completed"): TrialTurn => ({ parts: [{ type: "text-delta", id: "t", delta }], outcome });
const completion = (): TrialTurn => ({ parts: [{ type: "text-delta", id: "t", delta: "Well done." }, { type: "tool-call", toolName: "dojo_lesson_complete", input: {} }], outcome: "paused",
  questions: [{ interactionId: `complete-${Math.random()}`, title: "What would you like to do next?", allowOther: false,
    options: [{ id: "review", title: "Review" }, { id: "move-on", title: "Move on" }, { id: "pause", title: "Pause" }] }] });

/** A channel that answers each stage as a passing Sensei would; `on` replaces one call's answer */
function fakeChannel(on: Partial<{ [K in keyof TrialChannel]: (...args: Parameters<TrialChannel[K]>) => ReturnType<TrialChannel[K]> | undefined }> & { review?: () => TrialTurn } = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const saved = new Map<string, string>();
  const attempts = new Map<string, number>();
  const answered: string[] = [];
  const channel: TrialChannel = {
    async open(...args) { calls.push({ method: "open", args }); return await on.open?.(...args) ?? { sessionId: "session-1", turn: text("Welcome to the lesson.") }; },
    async send(...args) {
      calls.push({ method: "send", args });
      const custom = await on.send?.(...args);
      if (custom) return custom;
      return args[1] === reviewReply ? (on.review ?? completion)() : text(`About ${args[1]}`);
    },
    async answer(...args) {
      calls.push({ method: "answer", args });
      answered.push(...args[1].map(answer => answer.optionId ?? answer.text ?? ""));
      return await on.answer?.(...args) ?? text("Let's look back at what you built.");
    },
    async save(courseId, lessonId, content) { calls.push({ method: "save", args: [courseId, lessonId, content] }); saved.set(lessonId, content); },
    async check(courseId, lessonId, signal, sessionId) {
      calls.push({ method: "check", args: [courseId, lessonId, sessionId] });
      const content = saved.get(lessonId) ?? "";
      const solved = content.includes("SOLVED");
      const attempt = solved ? 1 : (attempts.get(lessonId) ?? 0) + 1;
      attempts.set(lessonId, attempt);
      const observation: CheckObservation = { id: `observation-${calls.length}`, attempt, codeChanged: attempt === 1, diff: "",
        report: { passed: solved ? 2 : 1, failed: solved ? 0 : 1, skipped: 0, total: 2, complete: solved, tests: [] } };
      return await on.check?.(courseId, lessonId, signal, sessionId) ?? { observation, ...(sessionId ? { turn: solved ? completion() : text("The second check still fails.") } : {}) };
    },
    async advance(...args) { calls.push({ method: "advance", args }); },
    async cancel(...args) { calls.push({ method: "cancel", args }); },
  };
  return { channel, calls, answered };
}

const reviewReply = "I chose the empty case so the total starts from nothing.";
function fakeRoles(): TrialRoles & { replies: number } {
  const roles = {
    replies: 0,
    fixtures: vi.fn(async (lessonIds: string[]) => Object.fromEntries(lessonIds.map(id => [id, fixture]))),
    reply: vi.fn(async () => { roles.replies++; return reviewReply; }),
    answer: vi.fn(async (questions: Array<{ id: string; options: Array<{ title: string }> }>) => Object.fromEntries(questions.map(question => [question.id, [question.options[0]!.title]]))),
    judge: vi.fn(),
  };
  return roles as unknown as TrialRoles & { replies: number };
}

async function trial(count = 1, options: { channel?: ReturnType<typeof fakeChannel>; signal?: AbortSignal } = {}) {
  const fixtureDraft = draft(count);
  const fake = options.channel ?? fakeChannel();
  const stopHost = vi.fn(async () => {});
  const roles = fakeRoles();
  let workspaceId: string | undefined;
  // The trial's lesson file and .dojorc once the install exists, before any fixture is verified
  let before: { file: string | null; rc: unknown } | undefined;
  const trialRoot = () => listWorkspaces().find(workspace => workspace.id === workspaceId)!.path;
  const run = runTrial({ draftRoot: fixtureDraft.root, lessonIds: fixtureDraft.lessonIds, signal: options.signal ?? AbortSignal.timeout(30_000), roles,
    evidenceRoot: fixtureDraft.evidenceRoot, stopHost, channel: target => {
      workspaceId = target.workspaceId;
      const rc = readDojoRc(trialRoot());
      const path = solutionPath(trialRoot(), rc.currentDojo!, fixtureDraft.lessonIds[0]!);
      before = { file: existsSync(path) ? readFileSync(path, "utf8") : null, rc };
      return fake.channel;
    } });
  const evidence = () => JSON.parse(readFileSync(join(fixtureDraft.evidenceRoot, "evidence.json"), "utf8")) as Array<Record<string, unknown>>;
  return { ...fixtureDraft, run, fake, stopHost, roles, trialRoot, evidence, workspaceId: () => workspaceId, before: () => before! };
}

describe("evaluation trial", () => {
  it("a wrong fixture that passes fails the trial before Sensei starts", async () => {
    scriptedChecks(() => "solved");
    const t = await trial();
    await expect(t.run).rejects.toThrow(`Learner fixture preflight failed: ${t.lessonIds[0]}/wrong must fail an authored test`);
    expect(t.fake.calls.map(call => call.method)).toEqual([]);
    expect(t.evidence()).toEqual(expect.arrayContaining([expect.objectContaining({ fixturePreflight: "failed" }), expect.objectContaining({ deterministicLifecycle: "failed" })]));
    expect(t.stopHost).toHaveBeenCalledWith(t.workspaceId(), "opencode");
  });

  it("a solved fixture that fails fails the trial", async () => {
    scriptedChecks(() => "wrong");
    const t = await trial();
    await expect(t.run).rejects.toThrow(`Learner fixture preflight failed: ${t.lessonIds[0]}/solved must pass every authored test`);
    expect(t.fake.calls).toEqual([]);
  });

  it("fixtures that verify leave the lesson file and progress as they were", async () => {
    scriptedChecks();
    const t = await trial();
    await t.run;
    const root = t.trialRoot();
    const path = solutionPath(root, readDojoRc(root).currentDojo!, t.lessonIds[0]!);
    expect(existsSync(path) ? readFileSync(path, "utf8") : null).toBe(t.before().file);
    expect(readDojoRc(root)).toEqual(t.before().rc);
    expect(existsSync(resolve(root, ".dojo/web.json"))).toBe(false);
    for (const call of vi.mocked(execFileSync).mock.calls) expect(call[1]).toEqual(expect.arrayContaining(["--check", "--no-record"]));
    expect(t.evidence()).toEqual(expect.arrayContaining([expect.objectContaining({ fixturePreflight: "passed" })]));
  });

  it("a guard violation after a turn fails the trial as teaching", async () => {
    scriptedChecks();
    let t: Awaited<ReturnType<typeof trial>>;
    const channel = fakeChannel({ send: (_sessionId, message) => {
      if (message !== fixture.misconception) return undefined;
      const root = t.trialRoot();
      const courseId = readDojoRc(root).currentDojo!;
      return addNotice(root, { workspaceId: t.workspaceId()!, violation: { sessionId: "session-1", courseId, lessonId: t.lessonIds[0]!, paths: ["x"], action: "restored", at: new Date().toISOString() } })
        .then(() => text("I changed your file."));
    } });
    t = await trial(1, { channel });
    await expect(t.run).rejects.toMatchObject({ name: "TeachingFailure", message: "Sensei edited learner code" });
    expect(t.evidence().at(-1)).toMatchObject({ deterministicLifecycle: "failed", error: "Sensei edited learner code" });
  });

  it("a change to installed material fails the trial", async () => {
    scriptedChecks();
    let t: Awaited<ReturnType<typeof trial>>;
    const channel = fakeChannel({ send: (_sessionId, message) => {
      if (message !== fixture.uncertainty) return undefined;
      const root = t.trialRoot();
      writeFileSync(resolve(dojoDir(root, readDojoRc(root).currentDojo!), "DOJO.md"), "Rewritten by Sensei.");
      return Promise.resolve(text("I improved the course."));
    } });
    t = await trial(1, { channel });
    await expect(t.run).rejects.toMatchObject({ name: "TeachingFailure", message: "Sensei changed installed material" });
  });

  it("a budget prompt fails the trial with its limit named", async () => {
    scriptedChecks();
    const channel = fakeChannel({ send: () => Promise.resolve({ parts: [], outcome: "paused", budget: true }) });
    const t = await trial(1, { channel });
    await expect(t.run).rejects.toThrow("The trial reached its usage limit.");
    expect(t.evidence().at(-1)).toMatchObject({ deterministicLifecycle: "failed", error: "The trial reached its usage limit." });
  });

  it("abort cancels the open turn and stops the trial's host", async () => {
    scriptedChecks();
    const controller = new AbortController();
    const channel = fakeChannel({ send: (_sessionId, _message, signal) => new Promise<TrialTurn>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      queueMicrotask(() => controller.abort(new Error("Cancelled by Kyoshi")));
    }) });
    const t = await trial(1, { channel, signal: controller.signal });
    await expect(t.run).rejects.toThrow("Cancelled by Kyoshi");
    expect(t.fake.calls.at(-1)).toEqual({ method: "cancel", args: ["session-1"] });
    expect(t.stopHost).toHaveBeenCalledWith(t.workspaceId(), "opencode");
  });

  it("the evidence passes readTeachingEvidence for one lesson, and for two with the first seeded", async () => {
    scriptedChecks();
    const one = await trial();
    await expect(one.run).resolves.toBe(one.evidenceRoot);
    const evidence = await readTeachingEvidence(one.evidenceRoot, one.lessonIds);
    expect(JSON.parse(evidence.lessonIds!)).toEqual(one.lessonIds);
    expect(evidence[`${one.lessonIds[0]}-instructions.md`]).toContain("Available learner fragment IDs");
    expect(one.evidence()[0]).toMatchObject({ learnerProfile: "struggling", priorLessons: "seed-completion", harness: "opencode", model: "openai/gpt-4o" });
    const two = await trial(2);
    await two.run;
    const seeded = await readTeachingEvidence(two.evidenceRoot, two.lessonIds);
    expect(JSON.parse(seeded.completedBefore!)).toEqual([two.lessonIds[0]]);
    expect(two.fake.calls.slice(0, 4).map(call => call.method)).toEqual(["save", "check", "advance", "open"]);
    expect(two.fake.calls[1]!.args).toEqual([expect.any(String), two.lessonIds[0], undefined]);
  });

  it("Review then Pause completes the trial; one completion choice is a teaching failure", async () => {
    scriptedChecks();
    const passing = await trial();
    await passing.run;
    expect(passing.fake.answered.filter(answer => ["review", "move-on", "pause"].includes(answer))).toEqual(["review", "pause"]);
    expect(passing.evidence().filter(entry => entry.completionChoices)).toHaveLength(2);
    expect(passing.roles.replies).toBe(1);
    const once = await trial(1, { channel: fakeChannel({ review: () => text("Here is a summary.") }) });
    await expect(once.run).rejects.toMatchObject({ name: "TeachingFailure", message: "Review must return to a completion choice" });
    expect(once.roles.replies).toBe(2);
  });
});

describe("the HTTP channel", () => {
  const events = (turnId: string) => [
    { type: "turn.started", data: { turnId } },
    { type: "content.completed", data: { partId: "p1", kind: "text", value: "Here is a hint.", phase: "reply" } },
    { type: "turn.settled", data: { turnId, outcome: "completed" } },
  ];

  it("notices and checks wait until the record has left working", async () => {
    const order: string[] = [];
    let statusReads = 0;
    // Eve's stream shows the settle at once; the record leaves working only on its third read
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/checks")) {
        order.push("check");
        return Response.json({ data: { meta: { observation: { id: "o", attempt: 1, codeChanged: true, diff: "", report: { passed: 0, failed: 1, skipped: 0, total: 1, complete: false, tests: [] } } } } }, { status: 201 });
      }
      statusReads++;
      const status = statusReads % 3 === 0 ? "idle" : "working";
      order.push(`record:${status}`);
      return Response.json({ id: "s", lifecycle: { status } });
    }));
    const stream: Array<{ type: string; data: Record<string, unknown> }> = [];
    const channel = httpChannel({ baseUrl: "http://127.0.0.1:9", workspaceId: "w", token: "t", eve: () => ({
      snapshot: async () => ({ events: [...stream] as never, session: {} as never }),
      send: async () => { stream.push(...events(`turn-${stream.length}`)); return {} as never; },
      respond: async () => ({}) as never,
      cancel: async () => ({}) as never,
    }) });
    const turn = await channel.send("s", "Help me.", AbortSignal.timeout(10_000));
    expect(turn).toEqual({ parts: [{ type: "text-delta", id: "p1", delta: "Here is a hint." }], outcome: "completed" });
    expect(order).toEqual(["record:working", "record:working", "record:idle"]);
    order.length = 0;
    statusReads = 0;
    // The check posts only once the record is idle, and follows the report's turn, which starts after it
    const checked = channel.check("course", "lesson", AbortSignal.timeout(10_000), "s");
    await vi.waitFor(() => expect(order).toContain("check"));
    stream.push(...events("report"));
    await checked;
    expect(order.slice(0, 4)).toEqual(["record:working", "record:working", "record:idle", "check"]);
  });
});
