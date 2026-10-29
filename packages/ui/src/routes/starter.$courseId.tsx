import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { starterCourses } from "@/lib/starter-courses";

/** Dashboard links enter the same workspace/install flow as Explore. */
export const Route = createFileRoute("/starter/$courseId")({
  beforeLoad: ({ params }) => {
    if (!starterCourses.some(item => item.id === params.courseId)) throw notFound();
    throw redirect({ to: "/explore", search: { course: params.courseId } });
  },
});
