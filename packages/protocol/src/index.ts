export const lessonCapabilities = {
  context: {
    method: "dojo.context",
    tool: "dojo_context",
    description: "Retrieve the current course, lesson, learner progress, and recent evidence when context is missing or stale.",
  },
  check: {
    method: "dojo.lesson.verify",
    tool: "dojo_lesson_verify",
    description: "Check the learner's current work using the lesson's authored checks.",
  },
  complete: {
    method: "dojo.lesson.complete",
    tool: "dojo_lesson_complete",
    description: "Ask how to continue after a completed lesson. For Review, follow the teaching style's review guidance, then call this tool again. Move on is advanced by the host. Pause ends cleanly.",
  },
} as const;

export const uiCapabilities = {
  ask: {
    method: "dojo.ui.ask",
    tool: "dojo_ui_ask",
    description: "Ask the learner an authored structured question in the Dojofoo UI and wait for their answer.",
  },
  show: {
    method: "dojo.ui.show",
    tool: "dojo_ui_show",
    description: "Show an authored lesson fragment in the Dojofoo UI by its supplied ID. After calling, do not announce, summarize, quote, or repeat the fragment; continue with at most one short connection or question.",
  },
} as const;

export interface DojoLessonContext {
  phase: "start" | "resume";
  course: { id: string; completedLessons: Array<{ id: string; title: string; summary: string }> };
  lesson: {
    id: string;
    title: string;
    objective: string;
    state: "completed" | "ongoing" | "not-started";
  };
  learner: {
    file: { path: string; language: string; content: string };
    latestCheck: unknown | null;
  };
}

export type LessonCapability = keyof typeof lessonCapabilities;

/** Agent-facing text only; structured context retains the exact editable source. */
export function formatLessonContext(context: DojoLessonContext): string {
  const { content, ...file } = context.learner.file;
  const metadata = { ...context, learner: { ...context.learner, file } };
  const source = content.split(/\r?\n/u)
    .map((line, index) => `L${index + 1}: ${line}`).join("\n");
  return `${JSON.stringify(metadata)}\n\nCurrent learner file (1-based line labels, not part of the file; use these for highlights):\n${source}`;
}

export type LessonCapabilityMethod = (typeof lessonCapabilities)[LessonCapability]["method"];
export type LessonCapabilityTool = (typeof lessonCapabilities)[LessonCapability]["tool"];
