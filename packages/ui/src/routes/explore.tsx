import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@dojofoo/uix/components/app-shell";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { categoryIcons } from "@dojofoo/uix/components/app-directory";
import { CourseExplore } from "@dojofoo/uix/containers/course-explore";
import { CoursesIcon, ExploreIcon } from "@dojofoo/uix/icons";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { starterCourses } from "@/lib/starter-courses";

export const Route = createFileRoute("/explore")({ component: ExplorePage });

function ExplorePage() {
  const navigate = Route.useNavigate();
  const { account, toast } = useAccountMenu();
  return <div className="h-dvh overflow-hidden"><AppShell {...account} workspace="Dojo" sidebarWidth="18rem" showNews={false} showOnboarding={false}
    brand={<a href="/" aria-label="Dojo dashboard" className="flex items-center"><BrandLogo className="w-11" /></a>}
    navigationKey="dashboard" active="explore" navigation={[{ id: "main", items: [
      { id: "courses", label: "Courses", icon: CoursesIcon, href: "/" },
      { id: "explore", label: "Explore", icon: ExploreIcon, href: "/explore" },
    ] }]} onNavigate={id => { void navigate({ to: id === "explore" ? "/explore" : "/" }); }}>
    <CourseExplore courses={starterCourses.map(item => ({ ...item, mark: <BrandLogo /> }))} featuredId="how-to-run-a-dojo"
      categories={[
        { id: "all", label: "All courses", icon: categoryIcons.all },
        { id: "getting-started", label: "Getting started", icon: categoryIcons.development },
        { id: "authoring", label: "Authoring", icon: categoryIcons.product },
      ]}
      description="Two starter courses to help you find your way and create something of your own. Their first lessons are being prepared."
      onOpen={courseId => { void navigate({ to: "/starter/$courseId", params: { courseId } }); }} />
    {toast}
  </AppShell></div>;
}
