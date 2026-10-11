import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  root: "", code: "stub", attempt: 0, questions: 0,
  turns: [] as string[], mutate: false, waitForReviewAnswer: false,
  choices: [] as string[], wrongNextLesson: false,
}));
vi.mock("@dojofoo/authoring/service", () => ({ createLessonTrial: () => ({ workspaceId: "trial", courseId: "course" }) }));
vi.mock("@dojofoo/config/local-state", () => ({ listWorkspaces: () => [{ id: "trial", path: state.root }] }));
vi.mock("@dojofoo/config/project-preparation", () => ({ prepareWorkspace: async () => {} }));
vi.mock("@dojofoo/authoring/evaluation/material", () => ({ readMaterial: async () => ({ "DOJO.md": "unchanged" }) }));
vi.mock("../run/routes", () => ({ runRoutes: { request: async () => new Response("{}") } }));
vi.mock("./codex-client", () => ({ acpClient: { configuration: () => [], shutdown: vi.fn() } }));
vi.mock("./service", () => ({
  startLessonSession: async (_root: string, lesson: string) => {
    state.code = "stub"; state.attempt = 0;
    return { sessionId: `session-${lesson}` };
  },
  getLesson: async () => ({ code: state.code }),
  setLessonModel: async () => {},
  writeLessonFile: async (_root: string, _course: string, _lesson: string, _file: string, code: string) => { state.code = code; },
  checkLesson: async () => ({ observation: {
    attempt: ++state.attempt,
    report: { total: 2, failed: state.code === "solved" ? 0 : 1, complete: state.code === "solved" },
  } }),
  streamLessonIntroduction: async () => { state.turns.push("introduction"); if (state.mutate) state.code = "agent edit"; },
  streamSensei: async (_root: string, _lesson: string, message: string, collect: (part: unknown) => void) => {
    state.turns.push(message);
    if (message === "review" && state.waitForReviewAnswer) collect({ type: "text-delta", delta: "What would happen for a different input?" });
    if ((message === "review" && !state.waitForReviewAnswer) || message === "My new prediction") collect({ type: "tool-input-available", toolName: "elicitation", input: { questions: [{ id: "completion", options: [{ id: "pause", title: "Pause" }, { id: "next", title: "Move on" }] }] } });
  },
  streamCheckObservation: async (_root: string, _lesson: string, observation: { report: { complete: boolean } }, collect: (part: unknown) => void) => {
    if (observation.report.complete) collect({ type: "tool-input-available", toolName: "elicitation", input: { questions: [{ id: "completion", options: [{ id: "review", title: "Review" }] }] } });
    if (observation.report.complete && state.waitForReviewAnswer) collect({ type: "text-delta", delta: "What would happen for a different input?" });
  },
  nextLesson: async () => { state.code = "stub"; state.attempt = 0; return { kata: state.wrongNextLesson ? "wrong-lesson" : "002-second" }; },
  answerSenseiQuestion: async (_root: string, _lesson: string, answers: Record<string, string[]>) => {
    state.questions++;
    const choice = Object.values(answers).flat()[0];
    state.choices.push(choice);
    return choice === "Move on" ? { kata: state.wrongNextLesson ? "wrong-lesson" : "002-second" } : { ok: true };
  },
}));

import { runAuthoringHandoff } from "./authoring-handoff";
import { acpClient } from "./codex-client";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs(); vi.clearAllMocks();
  state.turns = []; state.questions = 0; state.mutate = false; state.waitForReviewAnswer = false;
  state.choices = []; state.wrongNextLesson = false;
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "dojo-handoff-runner-"));
  roots.push(root); state.root = root;
  vi.stubEnv("DOJOFOO_EVALUATION_WORKER", "1");
  vi.stubEnv("DOJOFOO_HANDOFF_COURSE", root);
  vi.stubEnv("DOJOFOO_HARNESS", "codex");
  // The runner owns these settings in production only inside its worker.
  vi.stubEnv("DOJOFOO_HOME", ""); vi.stubEnv("DOJO_CLI", ""); vi.stubEnv("PORT", "");
  await mkdir(join(root, ".dojo"));
  await writeFile(join(root, "DOJO.md"), "Course guidance");
  const katas = ["001-first", "002-second"].map(name => ({ name, template: `src/${name}/solution.ts` }));
  for (const lesson of katas) {
    await mkdir(join(root, "src", lesson.name), { recursive: true });
    await writeFile(join(root, "src", lesson.name, "SENSEI.md"), "Lesson guidance");
  }
  await writeFile(join(root, "dojo.yaml"), JSON.stringify({ mode: "katas", katas }));
  await writeFile(join(root, ".dojo/learner-fixtures.json"), JSON.stringify(Object.fromEntries(katas.map(({ name }) => [name, {
    misconception: "I think the empty case is the same as zero.", wrong: "wrong", solved: "solved", review: "review",
  }]))));
  return root;
}

it("refuses to run in the live authoring server process", async () => {
  vi.stubEnv("DOJOFOO_EVALUATION_WORKER", "");
  await expect(runAuthoringHandoff()).rejects.toThrow("isolated worker");
  expect(acpClient.shutdown).not.toHaveBeenCalled();
});

it("fast-forwards the prior lesson and teaches only the evaluated lesson", async () => {
  await fixture();
  const evidenceRoot = await runAuthoringHandoff();
  const evidence = JSON.parse(await readFile(join(evidenceRoot, "evidence.json"), "utf8"));
  expect(evidence.at(-1)).toEqual({ deterministicLifecycle: "passed" });
  expect(evidence.find((item: { fastForward?: boolean }) => item.fastForward)).toMatchObject({ lessonId: "001-first", observation: { report: { complete: true } } });
  expect(evidence.filter((item: { sessionId?: string }) => item.sessionId).map((item: { sessionId: string }) => item.sessionId)).toEqual(["session-002-second"]);
  expect(state.choices).toEqual(["Review", "Pause"]);
  expect(evidence.find((item: { stage?: string }) => item.stage === "misconception").learnerMessage).toBe("I think the empty case is the same as zero.");
  for (const line of ["I don't understand that terminology yet.", "I'm getting frustrated. I keep trying and still don't understand what's wrong.", "I have a plan now. I'd like to try it on my own."]) {
    expect(state.turns.filter(message => message === line)).toHaveLength(1);
  }
  expect(acpClient.shutdown).toHaveBeenCalledOnce();
});

it("rejects prior progress that does not open the evaluated lesson", async () => {
  await fixture(); state.wrongNextLesson = true;
  await expect(runAuthoringHandoff()).rejects.toThrow("Prior progress must open the evaluated lesson");
});

it.each([false, true])("captures the production MDX guidance (Markdown also present=%s)", async markdownPresent => {
  const root = await fixture();
  const directory = join(root, "src/001-first");
  if (!markdownPresent) await rm(join(directory, "SENSEI.md"));
  await writeFile(join(directory, "SENSEI.mdx"), "# MDX guidance\n<Present id=\"example\">Example</Present>");
  const evidenceRoot = await runAuthoringHandoff(undefined, ["001-first"]);
  const instructions = await readFile(join(evidenceRoot, "001-first-instructions.md"), "utf8");
  expect(instructions).toContain("# MDX guidance");
  expect(instructions).not.toContain("Lesson guidance");
});

it("retains a lifecycle failure and cleans up if Sensei edits the learner file", async () => {
  const root = await fixture(); state.mutate = true;
  await expect(runAuthoringHandoff()).rejects.toThrow("Sensei edited learner code");
  const { readdir } = await import("node:fs/promises");
  const [run] = await readdir(join(root, ".dojo/handoffs"));
  const evidence = JSON.parse(await readFile(join(root, ".dojo/handoffs", run, "evidence.json"), "utf8"));
  expect(evidence.at(-1).deterministicLifecycle).toBe("failed");
  expect(acpClient.shutdown).toHaveBeenCalledOnce();
});

it("lets the learner answer the actual review before requiring completion", async () => {
  await fixture(); state.waitForReviewAnswer = true;
  const respondToReview = vi.fn(async () => "My new prediction");
  const directory = await runAuthoringHandoff(undefined, ["001-first"], { verifyFixtures: async () => ({}), respondToReview });
  expect(respondToReview).toHaveBeenCalledOnce();
  expect(respondToReview.mock.calls[0]).toEqual([
    expect.arrayContaining([{ role: "assistant", content: "What would happen for a different input?" }]),
    "solved", expect.any(AbortSignal),
  ]);
  const evidence = JSON.parse(await readFile(join(directory, "evidence.json"), "utf8"));
  expect(evidence.find((turn: { stage?: string }) => turn.stage === "review").learnerMessage).toBe("My new prediction");
  expect(state.turns).not.toContain("review");
  expect(evidence.at(-1).deterministicLifecycle).toBe("passed");
});

it("bounds review followups instead of endlessly simulating a learner", async () => {
  await fixture(); state.waitForReviewAnswer = true;
  const respondToReview = vi.fn(async () => "Still unsure");
  await expect(runAuthoringHandoff(undefined, ["001-first"], { verifyFixtures: async () => ({}), respondToReview })).rejects.toThrow("Review must return");
  expect(respondToReview).toHaveBeenCalledTimes(2);
});

it("tests a confident learner in a fresh session without scripted struggle", async () => {
  await fixture(); state.waitForReviewAnswer = true;
  const respondToReview = vi.fn().mockResolvedValueOnce("I can explain my implementation").mockResolvedValueOnce("My new prediction");
  const directory = await runAuthoringHandoff(undefined, ["001-first"], { learnerProfile: "confident", verifyFixtures: async () => ({}), respondToReview });
  const evidence = JSON.parse(await readFile(join(directory, "evidence.json"), "utf8"));
  expect(evidence[0].learnerProfile).toBe("confident");
  expect(evidence.find((turn: { stage?: string }) => turn.stage === "quick-understanding").learnerMessage).toBe("I can explain my implementation");
  expect(evidence.some((turn: { stage?: string }) => turn.stage === "uncertainty" || turn.stage === "failure-1")).toBe(false);
  expect(evidence.at(-1).deterministicLifecycle).toBe("passed");
  expect(respondToReview).toHaveBeenCalledTimes(2);
});

it("does not start Sensei if generated learner fixtures fail preflight", async () => {
  const root = await fixture();
  const verifyFixtures = vi.fn(async () => { throw new Error("Fixture cannot satisfy the tests"); });
  await expect(runAuthoringHandoff(undefined, undefined, { verifyFixtures })).rejects.toThrow("Fixture cannot satisfy");
  expect(state.turns).toEqual([]);
  expect(verifyFixtures).toHaveBeenCalledOnce();
  const { readdir } = await import("node:fs/promises");
  const [run] = await readdir(join(root, ".dojo/handoffs"));
  const evidence = JSON.parse(await readFile(join(root, ".dojo/handoffs", run, "evidence.json"), "utf8"));
  expect(evidence.at(-1).fixturePreflight).toBe("failed");
});
