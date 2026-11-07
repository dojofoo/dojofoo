import { createFileRoute, redirect, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { prepareEditor } from "@dojofoo/uix/lib/preload-editor";
import { interactiveQuery, lessonQuery, conversationQuery, runQuery, RunNotFound } from "@/lib/learn-queries";
import { InteractiveCourse } from "@/components/interactive-course";
import { LessonLoading, LessonPage } from "./index";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { RouteErrorPanel } from "./__root";

/** A course run: the course, the kata lesson to open (the course's current one without a lesson segment) and the conversation a history
 *  pick asked for (D30).
 *  The loader awaits what the page shows first (the outline and the current lesson) from the query cache, and starts reading the
 *  page's conversation without waiting for it (TanStack Router, "Deferred data loading"). A cached course renders at once and
 *  refetches when the page mounts. */
export const Route = createFileRoute("/learn/$runId/{-$lessonId}")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { lesson?: string; session?: string } => ({
    ...(typeof search.lesson === "string" ? { lesson: search.lesson } : {}),
    ...(typeof search.session === "string" ? { session: search.session } : {}),
  }),
  // The old `?lesson=` address moves to the lesson's path
  beforeLoad: ({ params, search }) => {
    if (search.lesson === undefined) return;
    throw redirect({ to: "/learn/$runId/{-$lessonId}", params: { runId: params.runId, lessonId: params.lessonId ?? search.lesson },
      search: search.session ? { session: search.session } : {}, replace: true });
  },
  loader: async ({ params, context: { queryClient } }) => {
    // An id that is not a run lands on the dashboard, not an error page (D33)
    // Cached data answers at once and is refetched behind it, so a preload made when the card rendered is current by the click
    const course = await queryClient.ensureQueryData({ ...runQuery(params.runId), revalidateIfStale: true }).catch(error => {
      if (error instanceof RunNotFound) throw redirect({ to: "/", replace: true });
      throw error;
    });
    if (course.mode === "interactive") {
      await queryClient.ensureQueryData({ ...interactiveQuery(course.workspaceId, course.id), revalidateIfStale: true });
      void queryClient.prefetchQuery(conversationQuery(course.workspaceId, { course: course.id }));
      return;
    }
    const lessonId = params.lessonId ?? course.kata ?? undefined;
    if (lessonId) {
      await queryClient.ensureQueryData({ ...lessonQuery(course.workspaceId, course.id, lessonId), revalidateIfStale: true });
      void queryClient.prefetchQuery(conversationQuery(course.workspaceId, { course: course.id, lesson: lessonId }));
      // The editor and Monaco load with the lesson's data, not when the page first needs them
      prepareEditor();
    }
  },
  component: LearnPage,
  pendingComponent: LearnPending,
  errorComponent: LearnError,
});

function LearnPage() {
  const { runId, lessonId: requestedLesson } = Route.useParams();
  const search = Route.useSearch();
  const { data: course } = useSuspenseQuery(runQuery(runId));
  const lessonId = requestedLesson ?? course.kata ?? undefined;
  if (course.mode === "interactive") return <InteractiveLearn key={course.id} runId={runId} workspace={course.workspaceId} course={course.id} session={search.session} />;
  // A requested conversation that no longer belongs to the lesson opens the default (D29)
  return <KataLearn key={`${course.id}:${lessonId}`} runId={runId} workspace={course.workspaceId} course={course.id} lessonId={lessonId} session={search.session} />;
}

function InteractiveLearn({ runId, workspace, course, session }: { runId: string; workspace: string; course: string; session?: string }) {
  const { data } = useSuspenseQuery(interactiveQuery(workspace, course));
  return <InteractiveCourse runId={runId} workspace={workspace} course={course} initialLesson={data} requestedSession={session} />;
}

function KataLearn({ runId, workspace, course, lessonId, session }: { runId: string; workspace: string; course: string; lessonId?: string; session?: string }) {
  const lesson = useQuery({ ...lessonQuery(workspace, course, lessonId ?? ""), enabled: lessonId !== undefined }).data;
  return <LessonPage runId={runId} requestedWorkspaceId={workspace} requestedCourseId={course} requestedLessonId={lessonId}
    initialLesson={lesson?.kata === lessonId ? lesson : undefined} requestedSessionId={session} />;
}

function LearnPending() {
  const { account, toast } = useAccountMenu();
  return <LessonLoading account={account} toast={toast} />;
}

function LearnError(props: ErrorComponentProps) {
  const router = useRouter();
  return <RouteErrorPanel {...props} reset={() => { void router.invalidate(); }} />;
}
