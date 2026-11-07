import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@dojofoo/uix/web/landing";
import { lazy, Suspense } from "react";
import { loadMarketplaceCourses } from "@/lib/courses.functions";
import { toUIXCourse } from "@/lib/uix-course";
import { canonicalLink } from "@/lib/social-metadata";
import { cli, faqPage, jsonLd, organization, website } from "@/lib/structured-data";
import { questions } from "@dojofoo/uix/web/seo";

const LearningPreview = lazy(() => import("@dojofoo/uix/web/learning-preview").then(module => ({ default: module.LearningPreview })));

export const Route = createFileRoute("/")({
  loader: () => loadMarketplaceCourses(),
  staleTime: 60_000,
  // The home page names the site (WebSite) and the one keeping the brand in its title (the root's), and the questions it shows
  head: () => ({ links: [canonicalLink("/")], scripts: [jsonLd(website, organization, cli, faqPage(questions.filter(item => item.status === "confirmed")))] }),
  component: HomePage,
});

function HomePage() {
  const courses = Route.useLoaderData().map(toUIXCourse);
  return <LandingPage courses={courses} featureCourse={courses[0]} preview={<Suspense fallback={<div className="h-full" />}><LearningPreview /></Suspense>} />;
}
