import { createFileRoute, redirect, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { InteractiveCourse } from "@/components/interactive-course";
import type { InteractiveSnapshot } from "@/server/interactive/service";
import type { LessonSnapshot } from "@/server/lesson/service";
import type { InstalledCourse } from "./course.$courseId";
import { LessonLoading, LessonPage } from "./index";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { RouteErrorPanel } from "./__root";

async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "This course session is no longer available.");
  return body;
}

/** A course run: the course, the kata lesson to open (the course's current one by default) and the conversation a history pick asked for (D30) */
export const Route = createFileRoute("/learn/$runId")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { lesson?: string; session?: string } => ({
    ...(typeof search.lesson === "string" ? { lesson: search.lesson } : {}),
    ...(typeof search.session === "string" ? { session: search.session } : {}),
  }),
  loaderDeps: ({ search }) => ({ lesson: search.lesson }),
  // A run that loads within 400 ms commits its page inside the view transition; a slower one shows the loading workspace for at least
  // 200 ms. A hover's preload is used for 10 s, so the click after it does not read the run again.
  pendingMs: 400,
  pendingMinMs: 200,
  preloadStaleTime: 10_000,
  loader: async ({ params, deps, abortController }) => {
    const signal = abortController.signal;
    const response = await fetch(`/api/control/learning-sessions/${encodeURIComponent(params.runId)}`, { signal });
    // An id that is not a run lands on the dashboard, not an error page (D33)
    if (response.status === 404) throw redirect({ to: "/", replace: true });
    const course = await response.json() as InstalledCourse & { error?: string };
    if (!response.ok) throw new Error(course.error ?? "This course session is no longer available.");
    const base = `/api/workspaces/${encodeURIComponent(course.workspaceId)}/courses/${encodeURIComponent(course.id)}`;
    if (course.mode === "interactive") {
      const interactive = await read<InteractiveSnapshot>(`${base}/interactive`, signal);
      return { course, interactive, lesson: undefined };
    }
    const lessonId = deps.lesson ?? course.kata ?? undefined;
    const lesson = lessonId ? await read<LessonSnapshot>(`${base}/lessons/${encodeURIComponent(lessonId)}?prepare=false`, signal) : undefined;
    return { course, lesson, interactive: undefined };
  },
  component: LearnPage,
  pendingComponent: LearnPending,
  errorComponent: LearnError,
});

function LearnPage() {
  const { course, interactive, lesson } = Route.useLoaderData();
  const { runId } = Route.useParams();
  const search = Route.useSearch();
  if (interactive) return <InteractiveCourse key={course.id} runId={runId} workspace={course.workspaceId} course={course.id} initialLesson={interactive}
    requestedSession={search.session} />;
  const lessonId = search.lesson ?? course.kata ?? undefined;
  // A requested conversation that no longer belongs to the lesson opens the default (D29)
  return <LessonPage key={`${course.id}:${lessonId}`} runId={runId} requestedWorkspaceId={course.workspaceId} requestedCourseId={course.id}
    requestedLessonId={lessonId} initialLesson={lesson?.kata === lessonId ? lesson : undefined} requestedSessionId={search.session} />;
}

function LearnPending() {
  const { account, toast } = useAccountMenu({ preserveWorkspace: true });
  return <LessonLoading account={account} toast={toast} />;
}

function LearnError(props: ErrorComponentProps) {
  const router = useRouter();
  return <RouteErrorPanel {...props} reset={() => { void router.invalidate(); }} />;
}
