import { createFileRoute, useLocation, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { InteractiveCourse } from "@/components/interactive-course";
import type { InteractiveSnapshot } from "@/server/interactive/service";
import type { LessonSnapshot } from "@/server/lesson/service";
import type { InstalledCourse } from "./course.$courseId";
import { LessonPage } from "./index";
import { RouteErrorPanel } from "./__root";

async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "This course session is no longer available.");
  return body;
}

export const Route = createFileRoute("/session/$sessionId")({
  ssr: false,
  pendingMs: Infinity,
  preloadStaleTime: 0,
  loader: async ({ params, abortController, location }) => {
    const signal = abortController.signal;
    const response = await fetch(`/api/control/learning-sessions/${encodeURIComponent(params.sessionId)}`, { signal });
    let course: InstalledCourse;
    let nativeLesson: { lessonId: string; sessionId: string } | undefined;
    if (response.ok) course = await response.json();
    else {
      const courses = await read<Array<{ dojo: string; sessions: Array<{ lessonId: string; sessionId: string }> }>>("/api/control/courses", signal);
      const item = courses.find(item => item.sessions.some(session => session.sessionId === params.sessionId));
      if (!item) throw new Error((await response.json()).error ?? "This course session is no longer available.");
      nativeLesson = item.sessions.find(session => session.sessionId === params.sessionId);
      course = await read<InstalledCourse>(`/api/control/courses/${encodeURIComponent(item.dojo)}`, signal);
    }
    const base = `/api/workspaces/${encodeURIComponent(course.workspaceId)}/courses/${encodeURIComponent(course.id)}`;
    if (course.mode === "interactive") {
      const interactive = await read<InteractiveSnapshot>(`${base}/interactive`, signal);
      return { course, interactive, lesson: undefined, nativeLesson };
    }
    const lessonId = nativeLesson?.lessonId ?? (location.state.courseLesson?.courseId === course.id ? location.state.courseLesson.lessonId : course.kata ?? undefined);
    const lesson = lessonId ? await read<LessonSnapshot>(`${base}/lessons/${encodeURIComponent(lessonId)}?prepare=false`, signal) : undefined;
    const requestedSession = nativeLesson?.sessionId ?? (location.state.lesson?.courseId === course.id ? location.state.lesson.sessionId : undefined);
    if (requestedSession && lesson?.sessionId !== requestedSession) throw new Error("This exact lesson session is unavailable.");
    return { course, lesson, interactive: undefined, nativeLesson };
  },
  component: SessionPage,
  errorComponent: SessionError,
});

function SessionPage() {
  const { course, interactive, lesson, nativeLesson } = Route.useLoaderData();
  const location = useLocation();
  if (interactive) return <InteractiveCourse key={course.id} workspace={course.workspaceId} course={course.id} initialLesson={interactive} />;
  const lessonId = nativeLesson?.lessonId ?? (location.state.courseLesson?.courseId === course.id ? location.state.courseLesson.lessonId : course.kata ?? undefined);
  return <LessonPage key={`${course.id}:${lessonId}`} requestedWorkspaceId={course.workspaceId} requestedCourseId={course.id}
    requestedLessonId={lessonId} initialLesson={lesson?.kata === lessonId ? lesson : undefined}
    requestedSessionId={nativeLesson?.sessionId ?? (location.state.lesson?.courseId === course.id ? location.state.lesson.sessionId : undefined)} />;
}

function SessionError(props: ErrorComponentProps) {
  const router = useRouter();
  return <RouteErrorPanel {...props} reset={() => { void router.invalidate(); }} />;
}
