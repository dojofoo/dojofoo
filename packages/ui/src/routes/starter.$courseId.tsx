import { createFileRoute, notFound } from "@tanstack/react-router";
import { AgentChatWorkspace } from "@dojofoo/uix/containers/learning-workspace";
import { Composer } from "@dojofoo/uix/containers/assistant-home";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { CourseCard } from "@dojofoo/uix/components/course-card";
import { Icon } from "@dojofoo/uix/components/app-shell";
import { LessonBrief } from "@dojofoo/uix/components/lesson-brief";
import { BackIcon } from "@dojofoo/uix/icons";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { starterCourses } from "@/lib/starter-courses";

export const Route = createFileRoute("/starter/$courseId")({
  beforeLoad: ({ params }) => { if (!starterCourses.some(item => item.id === params.courseId)) throw notFound(); },
  component: StarterCoursePage,
});

function StarterCoursePage() {
  const { courseId } = Route.useParams();
  const course = starterCourses.find(item => item.id === courseId)!;
  const navigate = Route.useNavigate();
  const { account, toast } = useAccountMenu();
  return <div className="h-dvh overflow-hidden"><AgentChatWorkspace {...account} workspace="Dojo" sidebarWidth="18rem" showNews={false} showOnboarding={false}
    brand={<a href="/" aria-label="Dojo dashboard" className="flex items-center"><BrandLogo className="w-11" /></a>}
    navigationKey={course.id} active={[]} navigation={[{ id: "lessons", heading: "Lessons", items: [], empty: "Lessons are being prepared.",
      before: <div className="lj-course"><CourseCard course={course} enrolled={{ version: course.version, progress: 0 }} /></div>,
    }]}
    crumbs={[{ label: "Dashboard", icon: <Icon icon={BackIcon} size={14} />, onClick: () => { void navigate({ to: "/" }); } }, { label: course.title }]}
    contentKind="material" editor={null}
    details={<LessonBrief title={course.title} lead={course.blurb}><p>This starter course is being prepared.</p></LessonBrief>}
    header={<span className="ui-as-chat__route ui-as-chat__speaker"><span className="ui-as-chat__dot" aria-hidden="true" /><b>Sensei</b><span className="ui-as-chat__speaker-note">Teaches this course</span></span>}
    composer={<Composer tray={false} models={[]} plugins={false} dictation={false} disabled placeholder="Your Sensei will be here when the first lesson is ready." />}>
    <p className="text-sm text-[var(--muted)]">Your Sensei conversation will begin with the first lesson.</p>
  </AgentChatWorkspace>{toast}</div>;
}
