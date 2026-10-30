import { createFileRoute } from "@tanstack/react-router";
import { CoursesPage } from "@dojofoo/uix/web/courses";
import { searchPage } from "@dojofoo/uix/web/seo";
import { loadMarketplaceCourses } from "@/lib/courses.functions";
import { toUIXCourse } from "@/lib/uix-course";
import { SITE_URL } from "@/lib/site";
import { canonicalLink, pageImage, socialMetadata } from "@/lib/social-metadata";
import { collection, jsonLd } from "@/lib/structured-data";

// Its title, and its lead as its description (CoursesPage in @dojofoo/uix/web/courses), as the Search story previews them
const { title, description } = searchPage("/dojos");

export const Route = createFileRoute("/dojos")({
  loader: () => loadMarketplaceCourses(),
  staleTime: 60_000,
  head: ({ loaderData: courses }) => ({
    meta: [{ title }, ...socialMetadata({ title, description, url: `${SITE_URL}/dojos`, image: pageImage("/dojos") })],
    links: [canonicalLink("/dojos")],
    scripts: [jsonLd(collection({ name: "Find your dojo", description, path: "/dojos", items: (courses ?? []).map(course => ({ name: course.name, path: `/courses/${course.source}/${course.slug}` })) }))],
  }),
  component: CatalogPage,
});

function CatalogPage() {
  return <CoursesPage courses={Route.useLoaderData().map(toUIXCourse)} />;
}
