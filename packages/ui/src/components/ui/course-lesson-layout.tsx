import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { BrandLogo } from "./brand-logo";
import { ScrollArea } from "./scroll-area";

export type CourseScreenTheme = "dark" | "light" | "inherit";

export function CourseLessonLayout({
  chat,
  className,
  height,
  lesson,
  navigation,
  style,
  theme = "inherit",
  width,
}: {
  chat: ReactNode;
  className?: string;
  height?: CSSProperties["height"];
  lesson: ReactNode;
  navigation: ReactNode;
  style?: CSSProperties;
  theme?: CourseScreenTheme;
  width?: CSSProperties["width"];
}) {
  return (
    <main
      className={cn(
        "grid h-screen min-h-[42rem] w-full grid-cols-[19rem_minmax(0,1fr)] overflow-hidden bg-background text-foreground",
        theme === "dark" && "dark dojo-theme-dark",
        theme === "light" && "dojo-theme-light",
        className,
      )}
      data-course-screen-theme={theme}
      style={{ ...style, ...(height === undefined ? {} : { height }), ...(width === undefined ? {} : { width }) }}
    >
      {navigation}
      <section className="grid min-h-0 min-w-0 grid-cols-[minmax(30rem,1.618fr)_minmax(22rem,1fr)]">
        {lesson}
        {chat}
      </section>
    </main>
  );
}

export function CourseLessonNavigation({
  children,
  courseTitle,
  homeHref = "/",
  sectionTitle = "Chapters",
  showLogo = true,
}: {
  children: ReactNode;
  courseTitle: string | null;
  homeHref?: string;
  sectionTitle?: string | null;
  showLogo?: boolean;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-dashed bg-surface-1" data-testid="lesson-navigation">
      <div className="px-5 pb-5 pt-5">
        {showLogo && <a aria-label="Back to your dojos" className="inline-flex" href={homeHref}>
          <BrandLogo alt="Dojofoo wordmark" className="h-6 w-14" />
        </a>}
        {courseTitle ? <h1 className="mt-1.5 text-xl font-semibold">{courseTitle}</h1> : null}
        {sectionTitle ? <h2 className="mt-7 font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{sectionTitle}</h2> : null}
      </div>
      <ScrollArea className="min-h-0 flex-1" data-testid="lesson-scroll" viewportClassName="scroll-fade pb-5">
        <div className="w-full">{children}</div>
      </ScrollArea>
    </aside>
  );
}
