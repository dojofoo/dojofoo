import { createFileRoute, redirect } from "@tanstack/react-router";

/** The old manual-trial address `/course/<workspace>/<course>/lesson/<lesson>` goes to the dashboard (D30); `/course/$courseId` is
 *  unchanged */
export const Route = createFileRoute("/course_/$workspaceId/$courseId/lesson/$lessonId")({
  beforeLoad: () => { throw redirect({ to: "/", replace: true }); },
});
