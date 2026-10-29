import { createFileRoute } from "@tanstack/react-router";
import { CoursesPage } from "@dojofoo/uix/web/courses";
import { loadMarketplaceCourses } from "@/lib/courses.functions";
import { toUIXCourse } from "@/lib/uix-course";
import { SITE_URL } from "@/lib/site";
import { canonicalLink, socialMetadata } from "@/lib/social-metadata";

const title = "Find your dojo · Dojo.foo";
// The page's lead (CoursesPage in @dojofoo/uix/web/courses)
const description = "A dojo is an installable package with its own sensei. It learns how you learn, then guides you through coding katas, interactive lessons, capstone projects or even interviews.";

export const Route = createFileRoute("/dojos")({
  loader: () => loadMarketplaceCourses(),
  staleTime: 60_000,
  head: () => ({
    meta: [{ title }, ...socialMetadata({ title, description, url: `${SITE_URL}/dojos` })],
    links: [canonicalLink("/dojos")],
  }),
  component: CatalogPage,
});

function CatalogPage() {
  return <CoursesPage courses={Route.useLoaderData().map(toUIXCourse)} />;
}
