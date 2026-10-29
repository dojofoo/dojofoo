import { createFileRoute } from "@tanstack/react-router";
import { LessonPage } from "./index";

export const Route = createFileRoute("/course/$workspaceId/$courseId/lesson/$lessonId")({
  component: CourseLessonPage,
  validateSearch: (search: Record<string, unknown>): { harness?: string } => ({
    harness: typeof search.harness === "string" ? search.harness : undefined,
  }),
});

function CourseLessonPage() {
  const { courseId, lessonId, workspaceId } = Route.useParams();
  const { harness } = Route.useSearch();
  return (
    <LessonPage
      key={`${workspaceId}/${courseId}/${lessonId}`}
      requestedHarness={harness}
      requestedCourseId={courseId}
      requestedLessonId={lessonId}
      requestedWorkspaceId={workspaceId}
    />
  );
}
