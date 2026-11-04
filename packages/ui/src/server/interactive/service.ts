import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { dojoDir, readCourseManifest, readDojoRc, type DojoManifest, readIntroduction, type CourseIntroduction } from "@dojofoo/config";

export type InteractiveStep =
  | { id: string; type: "complete"; title: string }
  | { id: string; type: "present"; title: string; content: string; contentBase: string | null }
  | { id: string; type: "question"; title: string; prompt: string; promptBase: string | null; answers: string[]; explanation: string; explanationBase: string | null };

type AuthoredInteractiveStep =
  | { id: string; type: "complete"; title: string }
  | { id: string; type: "present"; title: string; content: string }
  | { id: string; type: "question"; title: string; prompt: string; answers: string[]; explanation: string };

type InteractiveLesson = { id: string; title: string; slides: AuthoredInteractiveStep[] };
type InteractiveCurriculum = { id: string; title: string; deck?: string; lessons: InteractiveLesson[]; legacySteps?: string[] };
type CourseProgress = { step: number; lesson?: number; unlockedLessons?: number; unlockedSlides?: Record<string, number>; completed?: boolean;
  answers: Record<string, { answer: string; correct: boolean }> };

/** Progress only: the ACP conversation bindings (`conversations`, `conversationAgents`, `pendingRuntime`) are dropped on the next write */
type InteractiveState = {
  version: 1;
  courses: Record<string, CourseProgress>;
};

export type InteractiveSnapshot = {
  deck?: string;
  workspaceId?: string;
  dojo: string;
  course?: Pick<DojoManifest, "appearance" | "name" | "version" | "description" | "author" | "repository" | "language"> & { lessons: number; intro?: CourseIntroduction | null };
  title: string;
  lessonId: string;
  lessonIndex: number;
  completedLessons: number;
  lessons: Array<{ id: string; title: string; state?: "active" | "done" | "locked" }>;
  slides: Array<{ id: string; title: string; locked: boolean }>;
  unlockedStep: number;
  references: Array<{ source: string; basePath: string | null }>;
  lessonTitle: string;
  step: number;
  totalSteps: number;
  current: InteractiveStep | null;
  response: { answer: string; correct: boolean } | null;
  complete: boolean;
  /** Whether `.dojorc` names this course as `currentDojo`; only "Make this my current course" changes it (D30) */
  courseCurrent: boolean;
};

function progressFor(state: InteractiveState, dojo: string, curriculum: InteractiveCurriculum): CourseProgress {
  const progress = state.courses[dojo] ?? { step: 0, answers: {} };
  if (progress.lesson === undefined && curriculum.legacySteps) {
    const previous = curriculum.legacySteps;
    const location = (id: string) => curriculum.lessons.flatMap((lesson, index) => {
      const slide = lesson.slides.findIndex(entry => entry.id === id);
      return slide < 0 ? [] : [{ lesson: index, slide, id: lesson.id }];
    })[0];
    const complete = progress.step >= previous.length;
    const current = location(previous[Math.min(progress.step, previous.length - 1)]);
    if (!current) throw new Error("The course update cannot locate the saved material.");
    const visited = previous.slice(0, progress.step + 1).map(location).filter(entry => entry !== undefined);
    progress.lesson = complete ? curriculum.lessons.length - 1 : current.lesson;
    progress.step = complete ? curriculum.lessons[progress.lesson].slides.length : current.slide;
    progress.completed = complete;
    progress.unlockedLessons = complete ? curriculum.lessons.length - 1 : Math.max(...visited.map(entry => entry.lesson));
    progress.unlockedSlides = Object.fromEntries(curriculum.lessons.map((lesson, index) => [lesson.id, complete ? lesson.slides.length
      : Math.max(0, ...visited.filter(entry => entry.lesson === index).map(entry => entry.slide))]));
  }
  return progress;
}

export function getInteractiveLesson(root: string, requestedDojo?: string): InteractiveSnapshot {
  const { dojo, curriculum } = readCurriculum(root, requestedDojo);
  const progress = progressFor(readState(root), dojo, curriculum);
  const lessonIndex = progress.lesson ?? 0;
  const lesson = curriculum.lessons[lessonIndex];
  if (!lesson) throw new Error("Saved lesson no longer exists in this course.");
  // Previously finished courses stored the position just after the last slide.
  const selectedStep = progress.completed && progress.step >= lesson.slides.length && lesson.slides.at(-1)?.type === "complete"
    ? lesson.slides.length - 1 : progress.step;
  const authoredStep = lesson.slides[selectedStep] ?? null;
  const unlockedStep = progress.unlockedSlides?.[lesson.id] ?? progress.step;
  const unlockedLesson = progress.unlockedLessons ?? lessonIndex;
  const complete = progress.completed ?? (lessonIndex === curriculum.lessons.length - 1 && !authoredStep);
  const manifest = readCourseManifest(root, dojo);
  return {
    dojo, deck: curriculum.deck, title: manifest.title ?? curriculum.title, lessonId: lesson.id, lessonIndex, lessonTitle: lesson.title,
    completedLessons: complete ? curriculum.lessons.length : unlockedLesson,
    lessons: curriculum.lessons.map((entry, index) => ({ id: entry.id, title: entry.title,
      state: index < unlockedLesson || complete ? "done" : index === lessonIndex ? "active" : index > unlockedLesson ? "locked" : undefined })),
    slides: lesson.slides.map((entry, index) => ({ id: entry.id, title: entry.title, locked: index > unlockedStep })),
    unlockedStep,
    references: lesson.slides.flatMap(entry => {
      const slide = hydrateStep(root, dojo, entry);
      return slide.type === "present" ? [{ source: slide.content, basePath: slide.contentBase }]
        : slide.type === "question" ? [{ source: slide.prompt, basePath: slide.promptBase }, { source: slide.explanation, basePath: slide.explanationBase }] : [];
    }),
    course: { appearance: manifest.appearance, name: manifest.name, version: manifest.version, description: manifest.description, author: manifest.author,
      repository: manifest.repository, language: manifest.language, intro: readIntroduction(dojoDir(root, dojo), dojoDir(root, dojo), "course"), lessons: curriculum.lessons.length },
    step: Math.min(selectedStep, lesson.slides.length), totalSteps: lesson.slides.length,
    current: authoredStep ? hydrateStep(root, dojo, authoredStep) : null,
    response: authoredStep ? progress.answers[`${lesson.id}/${authoredStep.id}`] ?? progress.answers[authoredStep.id] ?? null : null,
    complete,
    courseCurrent: readDojoRc(root).currentDojo === dojo,
  };
}

export function answerInteractiveQuestion(root: string, answer: string, requestedDojo?: string): InteractiveSnapshot {
  const { dojo, curriculum } = readCurriculum(root, requestedDojo);
  const state = readState(root);
  const progress = progressFor(state, dojo, curriculum);
  const lesson = curriculum.lessons[progress.lesson ?? 0];
  const current = lesson.slides[progress.step];
  if (!current || current.type !== "question") throw new Error("The current slide is not a question.");
  const normalized = answer.trim().toLocaleLowerCase();
  progress.answers[`${lesson.id}/${current.id}`] = {
    answer: answer.trim(), correct: current.answers.some(candidate => candidate.trim().toLocaleLowerCase() === normalized),
  };
  if (progress.answers[`${lesson.id}/${current.id}`].correct) {
    progress.unlockedSlides ??= {};
    progress.unlockedSlides[lesson.id] = Math.max(progress.unlockedSlides[lesson.id] ?? 0, progress.step + 1);
    if (progress.step === lesson.slides.length - 1 && (progress.lesson ?? 0) < curriculum.lessons.length - 1) {
      progress.unlockedLessons = Math.max(progress.unlockedLessons ?? 0, (progress.lesson ?? 0) + 1);
    }
  }
  state.courses[dojo] = progress; writeState(root, state);
  return getInteractiveLesson(root, dojo);
}

export function advanceInteractiveLesson(root: string, requestedDojo?: string): InteractiveSnapshot {
  const { dojo, curriculum } = readCurriculum(root, requestedDojo);
  const state = readState(root);
  const progress = progressFor(state, dojo, curriculum);
  const lessonIndex = progress.lesson ?? 0;
  const lesson = curriculum.lessons[lessonIndex];
  const current = lesson.slides[progress.step];
  if (!current) return getInteractiveLesson(root, dojo);
  if (current.type === "complete" && lessonIndex === curriculum.lessons.length - 1) return getInteractiveLesson(root, dojo);
  const response = progress.answers[`${lesson.id}/${current.id}`] ?? progress.answers[current.id];
  const unlocked = progress.unlockedSlides?.[lesson.id] ?? progress.step;
  if (current.type === "question" && !response?.correct && progress.step >= unlocked) throw new Error("Answer the question correctly before continuing.");
  progress.unlockedSlides ??= {};
  progress.unlockedSlides[lesson.id] = Math.max(unlocked, progress.step + 1);
  if (progress.step + 1 === lesson.slides.length && lessonIndex + 1 < curriculum.lessons.length) {
    progress.lesson = lessonIndex + 1; progress.step = 0;
    progress.unlockedLessons = Math.max(progress.unlockedLessons ?? 0, lessonIndex + 1);
  } else {
    progress.step += 1;
    if (lessonIndex === curriculum.lessons.length - 1 && progress.step === lesson.slides.length) progress.completed = true;
    if (lesson.slides[progress.step]?.type === "complete") {
      progress.unlockedLessons = Math.max(progress.unlockedLessons ?? 0, Math.min(lessonIndex + 1, curriculum.lessons.length - 1));
      if (lessonIndex === curriculum.lessons.length - 1) progress.completed = true;
    }
  }
  state.courses[dojo] = progress; writeState(root, state);
  return getInteractiveLesson(root, dojo);
}

export function selectInteractiveMaterial(root: string, selection: { lessonId?: string; slideId?: string }, requestedDojo?: string): InteractiveSnapshot {
  const { dojo, curriculum } = readCurriculum(root, requestedDojo);
  const state = readState(root);
  const progress = progressFor(state, dojo, curriculum);
  const index = selection.lessonId ? curriculum.lessons.findIndex(lesson => lesson.id === selection.lessonId) : progress.lesson ?? 0;
  if (index < 0 || index > (progress.unlockedLessons ?? progress.lesson ?? 0)) throw new Error("This lesson is locked.");
  const lesson = curriculum.lessons[index];
  const slide = selection.slideId ? lesson.slides.findIndex(step => step.id === selection.slideId) : index === (progress.lesson ?? 0) ? progress.step : 0;
  const unlocked = progress.unlockedSlides?.[lesson.id] ?? (index === (progress.lesson ?? 0) ? progress.step : 0);
  if (slide < 0 || slide >= lesson.slides.length || slide > unlocked) throw new Error("This slide is locked.");
  progress.lesson = index; progress.step = slide;
  state.courses[dojo] = progress; writeState(root, state);
  return getInteractiveLesson(root, dojo);
}

function readCurriculum(root: string, requestedDojo?: string): { dojo: string; curriculum: InteractiveCurriculum } {
  const dojo = requestedDojo ?? readDojoRc(root).currentDojo;
  if (!dojo) throw new Error("No dojo is active.");
  const manifest = readCourseManifest(root, dojo);
  if (manifest.mode !== "interactive") throw new Error("The active dojo does not contain slide lessons.");
  const path = resolve(dojoDir(root, dojo), manifest.lessons);
  if (!existsSync(path)) throw new Error(`Course material not found: ${manifest.lessons}`);
  const raw = JSON.parse(readFileSync(path, "utf8"));
  // Existing authored introductions remain a single lesson with isolated slides.
  const curriculum: InteractiveCurriculum = Array.isArray(raw.steps)
    ? { id: raw.id, title: raw.title, lessons: [{ id: raw.id, title: raw.title, slides: raw.steps }] } : raw;
  if (!curriculum || typeof curriculum.id !== "string" || !curriculum.title?.trim() || !Array.isArray(curriculum.lessons) || !curriculum.lessons.length) {
    throw new Error("Invalid course: id, title and lessons are required.");
  }
  const lessonIds = new Set<string>();
  for (const lesson of curriculum.lessons) {
    if (!lesson.id || lessonIds.has(lesson.id) || !lesson.title?.trim() || !Array.isArray(lesson.slides) || !lesson.slides.length) throw new Error("Lessons require unique IDs, titles and slides.");
    lessonIds.add(lesson.id);
    const ids = new Set<string>();
    for (const step of lesson.slides) {
      if (!step.id || ids.has(step.id) || !step.title?.trim()) throw new Error("Slides require unique IDs and titles.");
      ids.add(step.id);
      if (step.type === "complete" && step === lesson.slides.at(-1)) continue;
      if (step.type === "present" && typeof step.content === "string") continue;
      if (step.type === "question" && typeof step.prompt === "string" && Array.isArray(step.answers) && step.answers.length && typeof step.explanation === "string") continue;
      throw new Error(`Invalid slide: ${step.id}`);
    }
  }
  return { dojo, curriculum };
}

function hydrateStep(root: string, dojo: string, step: AuthoredInteractiveStep): InteractiveStep {
  if (step.type === "complete") return step;
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
    // Only progress is read back, so the next write drops the old ACP bindings
    if (state.version === 1 && state.courses) return { version: 1, courses: state.courses };
  } catch {}
  return { version: 1, courses: {} };
}

function writeState(root: string, state: InteractiveState): void {
  const path = statePath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}
