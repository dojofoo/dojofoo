import { createFileRoute, notFound } from "@tanstack/react-router";
import { CoursePage } from "@dojofoo/uix/web/course";
import { loadMarketplaceCourses } from "@/lib/courses.functions";
import { toUIXCourse } from "@/lib/uix-course";

export const Route = createFileRoute("/courses/$source/$slug")({
  loader: async ({ params }) => {
    const courses = await loadMarketplaceCourses();
    const source = params.source === "dojocho" ? "dojofoo" : params.source;
    const course = courses.find(
      (item) => item.source === source && item.slug === params.slug,
    );
    if (!course) throw notFound();
    return course;
  },
  staleTime: 60_000,
  component: CourseDetailPage,
});


function CourseDetailPage() {
  return <CoursePage course={toUIXCourse(Route.useLoaderData())} />;
}
