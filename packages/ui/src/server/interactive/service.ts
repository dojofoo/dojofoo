import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { dojoDir, readCourseManifest, readDojoRc } from "@dojofoo/config";

export type InteractiveStep =
  | { id: string; type: "present"; title: string; content: string; contentBase: string | null }
  | { id: string; type: "question"; title: string; prompt: string; promptBase: string | null; answers: string[]; explanation: string; explanationBase: string | null };

type AuthoredInteractiveStep =
  | { id: string; type: "present"; title: string; content: string }
  | { id: string; type: "question"; title: string; prompt: string; answers: string[]; explanation: string };

type InteractiveLesson = {
  id: string;
  title: string;
  steps: AuthoredInteractiveStep[];
};

type InteractiveState = {
  version: 1;
  courses: Record<string, { step: number; answers: Record<string, { answer: string; correct: boolean }> }>;
};

export type InteractiveSnapshot = {
  dojo: string;
  title: string;
  lessonTitle: string;
  step: number;
  totalSteps: number;
  current: InteractiveStep | null;
  response: { answer: string; correct: boolean } | null;
  complete: boolean;
};

export function getInteractiveLesson(root: string): InteractiveSnapshot {
  const { dojo, lesson } = readLesson(root);
  const state = readState(root);
  const progress = state.courses[dojo] ?? { step: 0, answers: {} };
  const authoredStep = lesson.steps[progress.step] ?? null;
  const current = authoredStep ? hydrateStep(root, dojo, authoredStep) : null;
  return {
    dojo,
    title: readCourseManifest(root, dojo).name,
    lessonTitle: lesson.title,
    step: Math.min(progress.step, lesson.steps.length),
    totalSteps: lesson.steps.length,
    current,
    response: current ? progress.answers[current.id] ?? null : null,
    complete: current === null,
  };
}

export function answerInteractiveQuestion(root: string, answer: string): InteractiveSnapshot {
  const { dojo, lesson } = readLesson(root);
  const state = readState(root);
  const progress = state.courses[dojo] ?? { step: 0, answers: {} };
  const current = lesson.steps[progress.step];
  if (!current || current.type !== "question") throw new Error("The current step is not a question.");
  const normalized = answer.trim().toLocaleLowerCase();
  progress.answers[current.id] = {
    answer: answer.trim(),
    correct: current.answers.some((candidate) => candidate.trim().toLocaleLowerCase() === normalized),
  };
  state.courses[dojo] = progress;
  writeState(root, state);
  return getInteractiveLesson(root);
}

export function advanceInteractiveLesson(root: string): InteractiveSnapshot {
  const { dojo, lesson } = readLesson(root);
  const state = readState(root);
  const progress = state.courses[dojo] ?? { step: 0, answers: {} };
  const current = lesson.steps[progress.step];
  if (!current) return getInteractiveLesson(root);
  if (current.type === "question" && !progress.answers[current.id]) {
    throw new Error("Answer the question before continuing.");
  }
  progress.step += 1;
  state.courses[dojo] = progress;
  writeState(root, state);
  return getInteractiveLesson(root);
}

function readLesson(root: string): { dojo: string; lesson: InteractiveLesson } {
  const rc = readDojoRc(root);
  if (!rc.currentDojo) throw new Error("No dojo is active.");
  const manifest = readCourseManifest(root, rc.currentDojo);
  if (manifest.mode !== "interactive") throw new Error("The active dojo is not interactive.");
  const path = resolve(dojoDir(root, rc.currentDojo), manifest.lessons);
  if (!existsSync(path)) throw new Error(`Interactive lesson not found: ${manifest.lessons}`);
  const lesson = JSON.parse(readFileSync(path, "utf8")) as InteractiveLesson;
  validateLesson(lesson);
  return { dojo: rc.currentDojo, lesson };
}

function validateLesson(lesson: InteractiveLesson): void {
  if (!lesson || typeof lesson.id !== "string" || typeof lesson.title !== "string" || !Array.isArray(lesson.steps) || lesson.steps.length === 0) {
    throw new Error("Invalid interactive lesson: id, title, and at least one step are required.");
  }
  const ids = new Set<string>();
  for (const step of lesson.steps) {
    if (!step || typeof step.id !== "string" || !step.id || ids.has(step.id)) throw new Error("Interactive step IDs must be unique non-empty strings.");
    ids.add(step.id);
    if (step.type === "present") {
      if (typeof step.title !== "string" || typeof step.content !== "string") throw new Error(`Invalid presentation step: ${step.id}`);
    } else if (step.type === "question") {
      if (typeof step.title !== "string" || typeof step.prompt !== "string" || !Array.isArray(step.answers) || step.answers.length === 0 || typeof step.explanation !== "string") {
        throw new Error(`Invalid question step: ${step.id}`);
      }
    }
  }
}

function hydrateStep(root: string, dojo: string, step: AuthoredInteractiveStep): InteractiveStep {
  if (step.type === "present") {
    const content = authoredContent(root, dojo, step.content);
    return { ...step, content: content.body, contentBase: content.basePath };
  }
  const prompt = authoredContent(root, dojo, step.prompt);
  const explanation = authoredContent(root, dojo, step.explanation);
  return {
    ...step,
    prompt: prompt.body,
    promptBase: prompt.basePath,
    explanation: explanation.body,
    explanationBase: explanation.basePath,
  };
}

function authoredContent(root: string, dojo: string, value: string): { body: string; basePath: string | null } {
  if (!value.endsWith(".mdx")) return { body: value, basePath: null };
  const courseRoot = dojoDir(root, dojo);
  const path = resolve(courseRoot, value);
  const relativePath = relative(courseRoot, path);
  if (relativePath.startsWith("..") || relativePath === "") throw new Error(`MDX content escapes the dojo: ${value}`);
  if (!existsSync(path)) throw new Error(`MDX content not found: ${value}`);
  return { body: readFileSync(path, "utf8"), basePath: dirname(relativePath) === "." ? "" : dirname(relativePath) };
}

function statePath(root: string): string {
  return resolve(root, ".dojo", "interactive.json");
}

function readState(root: string): InteractiveState {
  try {
    const state = JSON.parse(readFileSync(statePath(root), "utf8")) as InteractiveState;
    if (state.version === 1 && state.courses) return state;
  } catch {}
  return { version: 1, courses: {} };
}

function writeState(root: string, state: InteractiveState): void {
  const path = statePath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}
