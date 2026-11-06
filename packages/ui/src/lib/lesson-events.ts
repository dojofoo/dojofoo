/** A learner finished a lesson (`lesson.completed`) or a whole course (`course.completed`) on this page. */
export type LessonEvent = {
  type: "lesson.completed" | "course.completed";
  workspace: string;
  course: string;
  lesson: string;
  mode: "interactive" | "kata";
};

const name = "dojo:lesson";

/** Announce a completion as a window event, so a listener needs no import from the page that finished the lesson.
 *  TODO: no listener yet. Uses this is meant for: a short unlock animation on the next sidebar lesson, a confetti
 *  celebration on `course.completed`, a one-question rating form for the lesson just finished (sent to the course
 *  author with consent), and a Sensei recap turn before the next lesson. A lesson component (`@dojofoo/components`,
 *  for example `<Confetti />` on a last slide) would subscribe with `onLessonEvent` rather than the page calling it. */
export function emitLessonEvent(event: LessonEvent): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<LessonEvent>(name, { detail: event }));
}

/** Subscribe to completions; returns the unsubscribe. */
export function onLessonEvent(listener: (event: LessonEvent) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<LessonEvent>).detail);
  window.addEventListener(name, handle);
  return () => window.removeEventListener(name, handle);
}
