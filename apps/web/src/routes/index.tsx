import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@dojofoo/uix/web/landing";
import { LearningIllustration } from "@dojofoo/uix/web/learning-illustration";
import { loadLearningIllustration } from "@/lib/learning-illustration.functions";
import { loadMarketplaceCourses } from "@/lib/courses.functions";
import { toUIXCourse } from "@/lib/uix-course";
import { canonicalLink } from "@/lib/social-metadata";
import { cli, jsonLd, organization, website } from "@/lib/structured-data";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [courses, illustration] = await Promise.all([loadMarketplaceCourses(), loadLearningIllustration()]);
    return { courses, illustration };
  },
  staleTime: 60_000,
  // The home page names the site (WebSite) and the one keeping the brand in its title (the root's)
  head: () => ({ links: [canonicalLink("/")], scripts: [jsonLd(website, organization, cli)] }),
  component: HomePage,
});

function HomePage() {
  const { courses: catalog, illustration } = Route.useLoaderData();
  const courses = catalog.map(toUIXCourse);
  return <LandingPage courses={courses} featureCourse={courses[0]} preview={<LearningIllustration {...illustration} />} />;
}
