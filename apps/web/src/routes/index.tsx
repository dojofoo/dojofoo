import { createFileRoute } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { visible } from "@tanstack/react-start/hydration";
import { LandingPage } from "@dojofoo/uix/web/landing";
import { TopographyBackdrop } from "@dojofoo/uix/web/topography-backdrop";
import { LearningIllustration, learningImagePreloads } from "@dojofoo/uix/web/learning-illustration";
import { loadMarketplaceCourses } from "@/lib/courses.functions";
import { toUIXCourse } from "@/lib/uix-course";
import { canonicalLink } from "@/lib/social-metadata";
import { cli, faqPage, jsonLd, organization, website } from "@/lib/structured-data";
import { questions } from "@dojofoo/uix/web/seo";

export const Route = createFileRoute("/")({
  loader: async () => {
    return { courses: await loadMarketplaceCourses() };
  },
  staleTime: 60_000,
  // The home page names the site (WebSite) and the one keeping the brand in its title (the root's), and the questions it shows
  head: () => ({ links: [canonicalLink("/"), ...learningImagePreloads], scripts: [jsonLd(website, organization, cli, faqPage(questions.filter(item => item.status === "confirmed")))] }),
  component: HomePage,
});

function HomePage() {
  const { courses: catalog } = Route.useLoaderData();
  const courses = catalog.map(toUIXCourse);
  return <LandingPage courses={courses} featureCourse={courses[0]} preview={<LearningIllustration />}
    backdrop={<Hydrate when={visible({ rootMargin: "600px" })}><TopographyBackdrop /></Hydrate>} />;
}
