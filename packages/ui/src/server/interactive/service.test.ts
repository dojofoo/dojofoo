import { afterEach, describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { advanceInteractiveLesson, answerInteractiveQuestion, getInteractiveLesson, selectInteractiveMaterial } from "./service";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function interactiveRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "dojofoo-interactive-"));
  roots.push(root);
  const dojo = resolve(root, ".dojos", "recall");
  mkdirSync(resolve(dojo, "lessons"), { recursive: true });
  writeFileSync(resolve(root, ".dojorc"), JSON.stringify({ currentDojo: "recall", currentKata: null, editor: null }));
  writeFileSync(resolve(dojo, "dojo.json"), JSON.stringify({
    mode: "interactive",
    name: "@test/recall",
    version: "1.0.0",
    description: "Recall lesson",
    lessons: "lessons/intro.json",
  }));
  writeFileSync(resolve(dojo, "lessons", "intro.json"), JSON.stringify({
    id: "intro",
    title: "Recall",
    steps: [
      { id: "read", type: "present", title: "Read", content: "Remember this." },
      { id: "answer", type: "question", title: "Recall", prompt: "What?", answers: ["this"], explanation: "It was this." },
    ],
  }));
  return root;
}

describe("interactive lesson", () => {
  it("finishes each bundled lesson on its completion slide before moving to the next lesson", () => {
    const root = interactiveRoot();
    cpSync(new URL("../../../../../courses/how-to-run-a-dojo", import.meta.url), resolve(root, ".dojos/how-to-run-a-dojo"), { recursive: true });
    const course = "how-to-run-a-dojo";
    expect(getInteractiveLesson(root, course).deck).toBe("slides.html");
    advanceInteractiveLesson(root, course);
    answerInteractiveQuestion(root, "wrong", course);
    expect(() => advanceInteractiveLesson(root, course)).toThrow("correctly");
    answerInteractiveQuestion(root, "workspace", course);
    expect(() => selectInteractiveMaterial(root, { lessonId: "material-and-resources" }, course)).toThrow("locked");
    expect(advanceInteractiveLesson(root, course)).toMatchObject({ lessonId: "workspace-and-files", completedLessons: 1, current: { type: "complete" }, complete: false });
    expect(getInteractiveLesson(root, course).current?.type).toBe("complete");
    expect(advanceInteractiveLesson(root, course).lessonId).toBe("material-and-resources");
    for (const answer of ["sidebar", "hint", "agent", "yes", "auto"]) {
      advanceInteractiveLesson(root, course);
      answerInteractiveQuestion(root, answer, course);
      const finished = advanceInteractiveLesson(root, course);
      expect(finished.current?.type).toBe("complete");
      if (!finished.complete) advanceInteractiveLesson(root, course);
    }
    expect(getInteractiveLesson(root, course)).toMatchObject({ complete: true, completedLessons: 6, current: { type: "complete" } });
    expect(advanceInteractiveLesson(root, course).current?.type).toBe("complete");
  });
  it("keeps lessons stable while navigating isolated slides and unlocks only after a correct answer", () => {
    const root = interactiveRoot();
    writeFileSync(resolve(root, ".dojos/recall/lessons/intro.json"), JSON.stringify({ id: "course", title: "Recall course", lessons: [
      { id: "first", title: "First lesson", slides: [
        { id: "read", type: "present", title: "Read", content: "One" },
        { id: "check", type: "question", title: "Check", prompt: "Which number?", answers: ["one"], explanation: "One" },
      ] },
      { id: "second", title: "Second lesson", slides: [{ id: "second-slide", type: "present", title: "Two", content: "Two" }] },
    ] }));
    const first = getInteractiveLesson(root);
    expect(first.title).toBe("Recall course");
    expect(first.lessons.map(lesson => lesson.title)).toEqual(["First lesson", "Second lesson"]);
    expect(() => selectInteractiveMaterial(root, { lessonId: "second" })).toThrow("locked");
    advanceInteractiveLesson(root);
    answerInteractiveQuestion(root, "wrong");
    expect(() => advanceInteractiveLesson(root)).toThrow("correctly");
    answerInteractiveQuestion(root, "one");
    expect(selectInteractiveMaterial(root, { slideId: "read" }).current?.id).toBe("read");
    expect(selectInteractiveMaterial(root, { slideId: "check" }).response?.correct).toBe(true);
    expect(advanceInteractiveLesson(root)).toMatchObject({ title: "Recall course", lessonTitle: "Second lesson", step: 0 });
    expect(selectInteractiveMaterial(root, { lessonId: "first" }).lessonTitle).toBe("First lesson");
    expect(getInteractiveLesson(root).completedLessons).toBe(1);
  });
  it("exposes installed course details independently of lesson and step titles", () => {
    const root = interactiveRoot();
    expect(getInteractiveLesson(root)).toMatchObject({
      title: "Recall", lessonTitle: "Recall",
      course: { name: "@test/recall", version: "1.0.0", description: "Recall lesson", lessons: 1 },
    });
  });

  it("addresses two installed courses independently without changing the active course", () => {
    const root = interactiveRoot();
    cpSync(resolve(root, ".dojos/recall"), resolve(root, ".dojos/second"), { recursive: true });
    expect(getInteractiveLesson(root, "second")).toMatchObject({ dojo: "second", step: 0 });
    expect(advanceInteractiveLesson(root, "second")).toMatchObject({ dojo: "second", step: 1 });
    expect(answerInteractiveQuestion(root, "other", "second").response).toEqual({ answer: "other", correct: false });
    expect(() => advanceInteractiveLesson(root, "second")).toThrow("correctly");
    answerInteractiveQuestion(root, "this", "second");
    expect(advanceInteractiveLesson(root, "second").complete).toBe(true);
    expect(getInteractiveLesson(root)).toMatchObject({ dojo: "recall", step: 0, response: null });
    expect(JSON.parse(readFileSync(resolve(root, ".dojorc"), "utf8")).currentDojo).toBe("recall");
    expect(() => getInteractiveLesson(root, "missing")).toThrow("Dojo manifest not found");
  });

  it("persists presentation, answer feedback, and completion", () => {
    const root = interactiveRoot();
    expect(getInteractiveLesson(root)).toMatchObject({ step: 0, complete: false, current: { id: "read" } });
    expect(advanceInteractiveLesson(root)).toMatchObject({ step: 1, current: { id: "answer" } });
    expect(answerInteractiveQuestion(root, "THIS")).toMatchObject({
      step: 1,
      response: { answer: "THIS", correct: true },
    });
    expect(getInteractiveLesson(root).response).toEqual({ answer: "THIS", correct: true });
    expect(advanceInteractiveLesson(root)).toMatchObject({ step: 2, complete: true, current: null });
  });

  it("preserves the position in an authored migration from steps to lesson slides", () => {
    const root = interactiveRoot();
    cpSync(new URL("../../../../../courses/how-to-run-a-dojo", import.meta.url), resolve(root, ".dojos/how-to-run-a-dojo"), { recursive: true });
    mkdirSync(resolve(root, ".dojo"), { recursive: true });
    writeFileSync(resolve(root, ".dojo/interactive.json"), JSON.stringify({ version: 1, courses: { "how-to-run-a-dojo": { step: 3, answers: {} } } }));
    expect(getInteractiveLesson(root, "how-to-run-a-dojo")).toMatchObject({ title: "How to run a dojo", lessonId: "agent-and-model", step: 0, complete: false });
    expect(getInteractiveLesson(root, "how-to-run-a-dojo").lessons).toHaveLength(6);
  });

  it("requires an answer before advancing past a question", () => {
    const root = interactiveRoot();
    advanceInteractiveLesson(root);
    expect(() => advanceInteractiveLesson(root)).toThrow("Answer the question correctly before continuing.");
  });
});
