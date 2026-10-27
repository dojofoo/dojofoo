import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readDojoRc } from "@dojofoo/config";
import * as preparation from "@dojofoo/config/project-preparation";
import { answerSenseiQuestion, checkLesson, dojoLessonContext, dojoLessonFragment, getLesson, nextLesson, saveLearnerObservation, shouldIntroduceLesson, setLessonModel, startLessonSession, streamLessonIntroduction, streamSensei, writeLessonFile } from "./service";
import { dojofooHarness } from "../harness/registry";
import { acpClient } from "./codex-client";
import kataTeaching from "./contracts/KATAS.md?raw";

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function freshCourse(): string {
  const root = mkdtempSync(join(tmpdir(), "dojofoo-fresh-course-"));
  roots.push(root);
  writeFileSync(resolve(root, ".dojorc"), JSON.stringify({
    currentDojo: "starter",
    currentKata: null,
    editor: "code",
    progress: {},
  }));
  const lesson = resolve(root, ".dojos", "starter", "katas", "001-first");
  mkdirSync(lesson, { recursive: true });
  writeFileSync(resolve(root, ".dojos", "starter", "dojo.yaml"), [
    "name: '@test/starter'",
    "version: 1.0.0",
    "description: A fresh course.",
    "test: echo ok",
    "katas:",
    "  - name: 001-first",
    "    template: katas/001-first/solution.ts",
    "  - name: 002-second",
    "    template: katas/002-second/solution.ts",
  ].join("\n"));
  writeFileSync(resolve(root, ".dojos", "starter", "DOJO.md"), "Teach carefully.");
  writeFileSync(resolve(lesson, "SENSEI.md"), "# First lesson\n\nBegin here.");
  writeFileSync(resolve(lesson, "solution.ts"), "export const answer = 0;\n");
  const second = resolve(root, ".dojos", "starter", "katas", "002-second");
  mkdirSync(second, { recursive: true });
  writeFileSync(resolve(second, "SENSEI.md"), "# Second lesson\n\nContinue here.");
  writeFileSync(resolve(second, "solution.ts"), "export const second = 0;\n");
  return root;
}

describe("fresh lesson state", () => {
  it("restores the explicitly selected model with its existing lesson session", async () => {
    const root = freshCourse();
    vi.spyOn(acpClient, "startThread").mockResolvedValue("model-session");
    vi.spyOn(acpClient, "resumeThread").mockResolvedValue();
    vi.spyOn(acpClient, "history").mockResolvedValue([]);
    const configuration = { id: "model", name: "Model", currentValue: "provider/default", options: [
      { value: "provider/default", name: "Default" }, { value: "provider/chosen", name: "Chosen" },
    ] };
    vi.spyOn(acpClient, "modelConfiguration").mockImplementation(() => configuration);
    const setModel = vi.spyOn(acpClient, "setModel").mockImplementation(async (_session, value) => {
      configuration.currentValue = value;
      return configuration;
    });
    await startLessonSession(root, "001-first");
    await setLessonModel(root, "001-first", "provider/chosen");
    expect(JSON.parse(readFileSync(resolve(root, ".dojo/web.json"), "utf8")).threads["starter/001-first"].model).toBe("provider/chosen");
    configuration.currentValue = "provider/default"; // A fresh native process loads its default.
    const resumed = await getLesson(root, "001-first");
    expect(resumed?.sessionId).toBe("model-session");
    expect(resumed?.model?.currentValue).toBe("provider/chosen");
    expect(setModel).toHaveBeenLastCalledWith("model-session", "provider/chosen");
    setModel.mockRejectedValueOnce(new Error("Model unavailable"));
    await expect(setLessonModel(root, "001-first", "provider/unavailable")).rejects.toThrow("Model unavailable");
    expect(JSON.parse(readFileSync(resolve(root, ".dojo/web.json"), "utf8")).threads["starter/001-first"].model).toBe("provider/chosen");
  });

  it("awaits the normal workspace setup before checking a fresh trial", async () => {
    const root = freshCourse();
    const setup = vi.spyOn(preparation, "prepareWorkspace").mockRejectedValue(new Error("Course setup failed"));
    await expect(checkLesson(root, "starter", "001-first")).rejects.toThrow("Course setup failed");
    expect(setup).toHaveBeenCalledExactlyOnceWith(root);
  });

  it("uses an explicitly selected trial harness across lessons without inheriting Pi from authoring", async () => {
    const root = freshCourse();
    vi.stubEnv("DOJOFOO_HARNESS", "pi");
    const start = vi.spyOn(acpClient, "startThread").mockResolvedValue("codex-trial");
    vi.spyOn(acpClient, "resumeThread").mockResolvedValue();
    vi.spyOn(acpClient, "history").mockResolvedValue([]);
    await startLessonSession(root, "001-first", "starter", "codex");
    expect(start).toHaveBeenLastCalledWith(expect.objectContaining({ harness: "codex" }));
    start.mockResolvedValueOnce("next-trial");
    await startLessonSession(root, "002-second", "starter");
    expect(start).toHaveBeenLastCalledWith(expect.objectContaining({ harness: "codex" }));
    expect(process.env.DOJOFOO_HARNESS).toBe("pi");
  });

  it("does not persist a trial harness when session creation fails", async () => {
    const root = freshCourse();
    vi.spyOn(acpClient, "startThread").mockRejectedValue(new Error("Login required"));
    await expect(startLessonSession(root, "001-first", "starter", "codex")).rejects.toThrow("Login required");
    const { existsSync } = await import("node:fs");
    const path = resolve(root, ".dojo/web.json");
    expect(existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).defaultHarness : undefined).toBeUndefined();
  });

  it("rejects an authoring-only harness before starting a trial, without silently substituting one", async () => {
    const root = freshCourse();
    const start = vi.spyOn(acpClient, "startThread").mockResolvedValue("trial-session");
    vi.spyOn(acpClient, "resumeThread").mockResolvedValue();
    vi.spyOn(acpClient, "history").mockResolvedValue([]);
    vi.stubEnv("DOJOFOO_HARNESS", "pi");
    await expect(startLessonSession(root, "001-first")).rejects.toThrow("not by the ACP lesson runtime");
    expect(start).not.toHaveBeenCalled();

    vi.stubEnv("DOJOFOO_HARNESS", "codex");
    expect((await startLessonSession(root, "001-first")).sessionId).toBe("trial-session");
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ harness: "codex" }));
  });

  it("surfaces a resume failure without replacing the conversation and recovers on retry", async () => {
    const root = freshCourse();
    const start = vi.spyOn(acpClient, "startThread").mockResolvedValue("recoverable-session");
    const resume = vi.spyOn(acpClient, "resumeThread").mockResolvedValue();
    vi.spyOn(acpClient, "history").mockResolvedValue([]);
    vi.spyOn(acpClient, "send").mockResolvedValue("");
    await startLessonSession(root, "001-first");
    const before = readFileSync(resolve(root, ".dojo/web.json"), "utf8");
    resume.mockRejectedValueOnce(new Error("Provider unavailable"));
    await expect(getLesson(root, "001-first")).rejects.toThrow("Provider unavailable");
    expect(readFileSync(resolve(root, ".dojo/web.json"), "utf8")).toBe(before);
    await streamSensei(root, "001-first", "Try again", () => {});
    expect((await getLesson(root, "001-first"))?.sessionId).toBe("recoverable-session");
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("keeps an existing conversation on its harness when the global default changes", async () => {
    const root = freshCourse();
    vi.stubEnv("DOJOFOO_HARNESS", "codex");
    const start = vi.spyOn(acpClient, "startThread").mockResolvedValue("owned-session");
    const resume = vi.spyOn(acpClient, "resumeThread").mockResolvedValue();
    vi.spyOn(acpClient, "history").mockResolvedValue([]);
    vi.spyOn(acpClient, "send").mockResolvedValue("");
    await startLessonSession(root, "001-first");

    vi.stubEnv("DOJOFOO_HARNESS", "pi");
    expect((await getLesson(root, "001-first"))?.sessionId).toBe("owned-session");
    await streamSensei(root, "001-first", "Please explain this", () => {});
    expect(start).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenLastCalledWith("owned-session", expect.objectContaining({ harness: "codex" }));
    expect((await getLesson(root, "002-second"))?.kata).toBe("002-second");
    vi.stubEnv("DOJOFOO_HARNESS", "opencode");
    start.mockResolvedValueOnce("replacement-session");
    expect((await startLessonSession(root, "001-first", "starter")).sessionId).toBe("replacement-session");
    expect(start).toHaveBeenLastCalledWith(expect.objectContaining({ harness: "opencode" }));
    const state = JSON.parse(readFileSync(resolve(root, ".dojo/web.json"), "utf8"));
    expect(state.threads["starter/001-first"].aliases).toContain("owned-session");
    await expect(startLessonSession(root, "001-first", "another-course")).rejects.toThrow("Course not found");
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("supplies completed lesson context without claiming unseen implementation details", async () => {
    const root = freshCourse();
    const initial = await getLesson(root, "001-first");
    expect(dojoLessonContext(initial!).course).toEqual({ id: "starter", completedLessons: [] });
    const rc = readDojoRc(root);
    rc.progress = { starter: { completed: ["001-first"], lastActive: "001-first" } };
    writeFileSync(resolve(root, ".dojorc"), JSON.stringify(rc));
    const next = await getLesson(root, "002-second");
    expect(dojoLessonContext(next!).course).toEqual({
      id: "starter",
      completedLessons: [{ id: "001-first", title: initial!.title, summary: initial!.lessons[0].summary }],
    });
  });

  it("carries source-linked learner statements and help into a subsequent lesson after history is unavailable", async () => {
    const root = freshCourse();
    const start = vi.spyOn(acpClient, "startThread").mockResolvedValue("first-thread");
    vi.spyOn(acpClient, "resumeThread").mockResolvedValue();
    const history = vi.spyOn(acpClient, "history").mockResolvedValue([]);
    await startLessonSession(root, "001-first");
    history.mockResolvedValue([
      { role: "user", kind: "message", text: "I do not know callbacks yet." },
      { role: "assistant", kind: "message", text: "A callback is a function passed to another function." },
    ]);
    await getLesson(root, "001-first");
    const rc = readDojoRc(root);
    rc.progress = { starter: { completed: ["001-first"], lastActive: "001-first" } };
    writeFileSync(resolve(root, ".dojorc"), JSON.stringify(rc));
    history.mockResolvedValue([]);
    const next = await getLesson(root, "002-second");
    const evidence = dojoLessonContext(next!).learner.evidence;
    expect(evidence?.map(entry => [entry.role, entry.text])).toEqual([
      ["user", "I do not know callbacks yet."],
      ["assistant", "A callback is a function passed to another function."],
    ]);
    expect(evidence?.every(entry => entry.source.sessionId === "first-thread" && entry.source.lessonId === "001-first")).toBe(true);
    expect(dojoLessonContext(next!).learner).not.toHaveProperty("mastery");
    start.mockResolvedValue("second-thread");
    const send = vi.spyOn(acpClient, "send").mockRejectedValue(new Error("capture context"));
    await expect(streamLessonIntroduction(root, "002-second", () => {})).rejects.toThrow("capture context");
    expect(send).toHaveBeenLastCalledWith("second-thread", "Begin the lesson.", expect.any(Function), expect.objectContaining({
      context: [expect.objectContaining({ text: expect.stringContaining('"text":"I do not know callbacks yet."') })],
    }));
    expect(dojoLessonContext((await getLesson(freshCourse(), "002-second"))!).learner.evidence).toBeUndefined();
  });

  it("preserves newer state changes while capturing native history", async () => {
    const root = freshCourse();
    vi.spyOn(acpClient, "startThread").mockResolvedValue("first-thread");
    vi.spyOn(acpClient, "resumeThread").mockResolvedValue();
    const history = vi.spyOn(acpClient, "history").mockResolvedValue([]);
    await startLessonSession(root, "001-first");
    history.mockImplementationOnce(async () => {
      const path = resolve(root, ".dojo/web.json");
      const state = JSON.parse(readFileSync(path, "utf8"));
      state.observations.concurrent = { code: "new work", failureSignature: "updated", attempt: 2 };
      writeFileSync(path, JSON.stringify(state));
      return [{ role: "user", kind: "message", text: "I want to try independently." }];
    });
    await getLesson(root, "001-first");
    const state = JSON.parse(readFileSync(resolve(root, ".dojo/web.json"), "utf8"));
    expect(state.observations.concurrent).toEqual({ code: "new work", failureSignature: "updated", attempt: 2 });
    expect(state.learnerEvidence["starter/001-first"][0].text).toBe("I want to try independently.");
  });

  it("keeps historical help when an existing lesson starts a fresh agent session", async () => {
    const root = freshCourse();
    const start = vi.spyOn(acpClient, "startThread").mockResolvedValue("old-thread");
    vi.spyOn(acpClient, "resumeThread").mockResolvedValue();
    const history = vi.spyOn(acpClient, "history").mockResolvedValue([]);
    await startLessonSession(root, "001-first");
    history.mockResolvedValue([{ role: "assistant", kind: "message", text: "We discussed how a block body returns a value." }]);
    await getLesson(root, "001-first");
    start.mockResolvedValue("fresh-thread");
    history.mockResolvedValue([]);
    const fresh = await startLessonSession(root, "001-first", "starter");
    expect(fresh.sessionId).toBe("fresh-thread");
    const evidence = dojoLessonContext(fresh).learner.evidence;
    expect(evidence).toEqual([expect.objectContaining({
      text: "We discussed how a block body returns a value.",
      source: expect.objectContaining({ sessionId: "old-thread" }),
    })]);
    const unchanged = readFileSync(resolve(root, ".dojo/web.json"), "utf8");
    await getLesson(root, "001-first");
    expect(readFileSync(resolve(root, ".dojo/web.json"), "utf8")).toBe(unchanged);
  });

  it("persists and corrects source-backed interpretations across lessons without keeping stale advice active", async () => {
    const root = freshCourse();
    vi.spyOn(acpClient, "startThread").mockResolvedValue("first-thread");
    vi.spyOn(acpClient, "resumeThread").mockResolvedValue();
    const history = vi.spyOn(acpClient, "history").mockResolvedValue([]);
    await startLessonSession(root, "001-first");
    history.mockResolvedValue([{ role: "user", kind: "message", text: "I do not know what a callback is." }]);
    const initial = await getLesson(root, "001-first");
    const citation = (index: number, snapshot = initial!) => {
      const { sessionId, messageId, sha256 } = snapshot.learnerEvidence![index]!.source;
      return { sessionId, messageId, sha256 };
    };
    const note = await saveLearnerObservation(root, "001-first", {
      category: "uncertainty", interpretation: "Learner reports unfamiliarity with callbacks.", status: "active", source: citation(0),
    });
    history.mockResolvedValue([
      { role: "user", kind: "message", text: "I do not know what a callback is." },
      { role: "assistant", kind: "message", text: "A callback is a function passed to another function." },
      { role: "user", kind: "message", text: "I understand the term now; I still need to try applying it." },
    ]);
    const updated = await getLesson(root, "001-first");
    await expect(saveLearnerObservation(root, "001-first", {
      category: "understanding", interpretation: "Learner understands callbacks.", status: "resolved", source: citation(1, updated!),
    })).rejects.toThrow("needs a user message");
    const replacement = await saveLearnerObservation(root, "001-first", {
      category: "uncertainty", interpretation: "Learner reports the term is clear; application remains untested.", status: "resolved", source: citation(2, updated!), replaces: note.id,
    });
    history.mockResolvedValue([]);
    const rc = readDojoRc(root);
    rc.progress = { starter: { completed: ["001-first"], lastActive: "001-first" } };
    writeFileSync(resolve(root, ".dojorc"), JSON.stringify(rc));
    const next = dojoLessonContext((await getLesson(root, "002-second"))!);
    expect(next.learner.interpretations).toEqual([replacement]);
    expect(next.learner.interpretations?.some(entry => entry.id === note.id)).toBe(false);
    expect(next.learner.interpretations?.[0]?.evidence.text).toContain("still need to try");
    expect(dojoLessonContext((await getLesson(freshCourse(), "002-second"))!).learner.interpretations).toBeUndefined();
  });

  it("retries an introduction until the lifecycle marks it complete", () => {
    expect(shouldIntroduceLesson({ introduced: false })).toBe(true);
    expect(shouldIntroduceLesson({ introduced: true })).toBe(false);
  });

  it("starts with lesson context without a second code-owned teaching prompt", async () => {
    const root = freshCourse();
    vi.spyOn(acpClient, "startThread").mockResolvedValue("intro-session");
    vi.spyOn(acpClient, "resumeThread").mockResolvedValue();
    vi.spyOn(acpClient, "history").mockResolvedValue([]);
    // Stop after observing the request; do not invoke the CLI completion marker.
    const send = vi.spyOn(acpClient, "send").mockRejectedValue(new Error("captured intro"));
    await expect(streamLessonIntroduction(root, "001-first", () => {})).rejects.toThrow("captured intro");
    expect(send).toHaveBeenCalledWith("intro-session", "Begin the lesson.", expect.any(Function), expect.objectContaining({
      visible: false,
      context: [expect.objectContaining({
        uri: "dojo://courses/starter/lessons/001-first/context",
        text: expect.stringContaining('"phase":"start"'),
      })],
    }));
  });

  it("presents the first lesson without requiring mutable current-kata state", async () => {
    const lesson = await getLesson(freshCourse(), "001-first");

    expect(lesson).toMatchObject({
      kata: "001-first",
      state: "not-started",
      isCurrent: true,
      code: "export const answer = 0;\n",
      starterCode: "export const answer = 0;\n",
    });
  });

  it("gives the sensei authoritative learner code without requiring file inspection", async () => {
    const lesson = await getLesson(freshCourse(), "001-first");

    expect(dojoLessonContext(lesson!).learner.file).toEqual({
      path: "katas/001-first/solution.ts",
      language: "typescript",
      content: "export const answer = 0;\n",
    });
  });

  it("persists the active lesson when its file is first saved", async () => {
    const root = freshCourse();

    await writeLessonFile(root, "starter", "001-first", "solution", "export const answer = 1;\n");

    expect(readDojoRc(root)).toMatchObject({
      currentKata: "001-first",
      progress: { starter: { completed: [], lastActive: "001-first" } },
    });
    expect(readFileSync(resolve(root, "katas", "001-first", "solution.ts"), "utf8"))
      .toBe("export const answer = 1;\n");
  });

  it("sends current numbered source to the agent while keeping editable context raw", async () => {
    const root = freshCourse();
    vi.spyOn(acpClient, "startThread").mockResolvedValue("context-session");
    vi.spyOn(acpClient, "resumeThread").mockResolvedValue();
    vi.spyOn(acpClient, "history").mockResolvedValue([]);
    const send = vi.spyOn(acpClient, "send").mockResolvedValue("");

    await streamSensei(root, "001-first", "Where should I start?", () => {});
    expect(send).toHaveBeenLastCalledWith("context-session", expect.any(String), expect.any(Function), expect.objectContaining({
      context: expect.arrayContaining([expect.objectContaining({
        mimeType: "text/plain",
        text: expect.stringContaining("L1: export const answer = 0;\nL2: "),
      })]),
    }));

    const code = "\n// learner note\nexport const answer = 1;\n";
    await writeLessonFile(root, "starter", "001-first", "solution", code);
    await streamSensei(root, "001-first", "What changed?", () => {});
    expect(send).toHaveBeenLastCalledWith("context-session", expect.any(String), expect.any(Function), expect.objectContaining({
      context: expect.arrayContaining([expect.objectContaining({
        text: expect.stringContaining("L1: \nL2: // learner note\nL3: export const answer = 1;\nL4: "),
      })]),
    }));
    expect(dojoLessonContext((await getLesson(root, "001-first"))!).learner.file.content).toBe(code);
  });

  it("advances by materializing the next lesson without spawning the CLI", async () => {
    const root = freshCourse();
    const rc = readDojoRc(root);
    rc.currentKata = "001-first";
    rc.progress = { starter: { completed: ["001-first"], lastActive: "001-first" } };
    writeFileSync(resolve(root, ".dojorc"), `${JSON.stringify(rc)}\n`);

    const next = await nextLesson(root, { checkpointCurrent: false });

    expect(next).toMatchObject({ kata: "002-second", isCurrent: true, state: "ongoing" });
    expect(readFileSync(resolve(root, "katas/002-second/solution.ts"), "utf8"))
      .toBe("export const second = 0;\n");
  });

  it("starts a distinct session while retaining the previous session as history", async () => {
    const root = freshCourse();
    mkdirSync(resolve(root, ".dojo"), { recursive: true });
    writeFileSync(resolve(root, ".dojo", "web.json"), JSON.stringify({
      version: 4,
      threads: {
        "starter/001-first": {
          sessionId: "old-session",
          harness: dojofooHarness(),
          contractHash: "old-contract",
          aliases: [],
        },
      },
      results: {},
      checkpoints: {},
      observations: {},
    }));
    vi.spyOn(acpClient, "startThread").mockResolvedValue("new-session");
    vi.spyOn(acpClient, "resumeThread").mockResolvedValue();
    vi.spyOn(acpClient, "history").mockResolvedValue([]);

    const lesson = await startLessonSession(root, "001-first");
    const state = JSON.parse(readFileSync(resolve(root, ".dojo", "web.json"), "utf8"));

    expect(lesson.sessionId).toBe("new-session");
    // Legacy kata manifests omit mode; they still need the kata lifecycle
    // contract, including returning to the completion prompt after Review.
    expect(acpClient.startThread).toHaveBeenCalledWith(expect.objectContaining({
      developerInstructions: expect.stringContaining(kataTeaching),
    }));
    expect(state.threads["starter/001-first"]).toMatchObject({
      sessionId: "new-session",
      aliases: ["old-session"],
    });
  });

  it("answers Review without navigation and Move on materializes the next lesson", async () => {
    const root = freshCourse();
    vi.spyOn(acpClient, "startThread").mockResolvedValue("completion-session");
    vi.spyOn(acpClient, "history").mockResolvedValue([]);
    vi.spyOn(acpClient, "resumeThread").mockResolvedValue();
    const answer = vi.spyOn(acpClient, "answerUserInput").mockImplementation(() => {});
    await startLessonSession(root, "001-first");
    const rc = readDojoRc(root);
    rc.progress = { starter: { completed: ["001-first"], lastActive: "001-first" } };
    rc.currentKata = "001-first";
    writeFileSync(resolve(root, ".dojorc"), JSON.stringify(rc));

    await expect(answerSenseiQuestion(root, "001-first", { completion: ["Review"] })).resolves.toEqual({ ok: true });
    expect(readDojoRc(root).currentKata).toBe("001-first");
    const next = await answerSenseiQuestion(root, "001-first", { completion: ["Move on"] });
    expect(next).toMatchObject({ kata: "002-second", isCurrent: true });
    expect(answer).toHaveBeenLastCalledWith("completion-session", { completion: ["Move on"] });
    expect(readDojoRc(root).currentKata).toBe("002-second");
    expect(readFileSync(resolve(root, "katas/002-second/solution.ts"), "utf8")).toBe("export const second = 0;\n");
  });

  it("allows only authored fragments from the active lesson", async () => {
    const root = freshCourse();
    const lessonPath = resolve(root, ".dojos", "starter", "katas", "001-first", "SENSEI.md");
    writeFileSync(lessonPath, '# First lesson\n\n<Present id="example">Visible material</Present>');
    const lesson = await getLesson(root, "001-first");
    expect(lesson).not.toBeNull();

    expect(dojoLessonFragment(lesson!, "example")).toEqual({ fragmentId: "example" });
    expect(() => dojoLessonFragment(lesson!, "invented")).toThrow("Lesson fragment not found");
  });
});
