import { createFileRoute } from "@tanstack/react-router";
import { CoursesPage } from "@dojofoo/uix/web/courses";
import { loadMarketplaceCourses } from "@/lib/courses.functions";
import { toUIXCourse } from "@/lib/uix-course";

export const Route = createFileRoute("/dojos")({
  loader: () => loadMarketplaceCourses(),
  staleTime: 60_000,
  component: CatalogPage,
});

function CatalogPage() {
  return <CoursesPage courses={Route.useLoaderData().map(toUIXCourse)} />;
}
