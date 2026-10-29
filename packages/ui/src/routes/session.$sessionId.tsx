import { createFileRoute, useLocation } from "@tanstack/react-router";
import { LessonPage } from "./index";

export const Route = createFileRoute("/session/$sessionId")({
  component: SessionPage,
});

function SessionPage() {
  const { sessionId: routeSessionId } = Route.useParams();
  const location = useLocation();
  const context = (location.maskedLocation ?? location).state.lesson;
  const sessionId = location.maskedLocation && context ? context.sessionId : routeSessionId;
  const lesson = context?.sessionId === sessionId ? context : undefined;
  return <LessonPage requestedSessionId={sessionId} requestedWorkspaceId={lesson?.workspaceId}
    requestedCourseId={lesson?.courseId} requestedLessonId={lesson?.lessonId} />;
}
