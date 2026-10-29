import { createFileRoute, notFound } from "@tanstack/react-router";
import { CoursePage } from "@dojofoo/uix/web/course";
import { loadMarketplaceCourses } from "@/lib/courses.functions";
import { toUIXCourse } from "@/lib/uix-course";
import { SITE_URL } from "@/lib/site";
import { canonicalLink, socialMetadata } from "@/lib/social-metadata";
import { breadcrumbs, course as courseNode, jsonLd } from "@/lib/structured-data";

// What a course is, by how it teaches, for its title: "Effect TS – Free TypeScript katas"
const kinds = { katas: "katas", interactive: "course", explorative: "course", mentor: "mentoring" } as const;

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
  head: ({ loaderData: course }) => {
    if (!course) return {};
    const title = `${course.name} – Free ${course.language ? `${course.language} ` : ""}${kinds[course.mode] ?? "course"}`;
    const path = `/courses/${course.source}/${course.slug}`;
    return {
      meta: [{ title }, ...socialMetadata({ title, description: course.description, url: SITE_URL + path, type: "article" })],
      links: [canonicalLink(path)],
      scripts: [jsonLd(
        courseNode({ ...course, path }),
        breadcrumbs([["Dojos", "/dojos"], [course.name, path]]),
      )],
    };
  },
  component: CourseDetailPage,
});


function CourseDetailPage() {
  return <CoursePage course={toUIXCourse(Route.useLoaderData())} />;
}
