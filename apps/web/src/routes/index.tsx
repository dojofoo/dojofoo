import { createFileRoute } from "@tanstack/react-router";
import { CardGroup, Select, SelectContent, SelectItem, SelectTrigger } from "@dojofoo/ui";
import { ArrowUpDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { CourseCard } from "@/components/marketplace/course-card";
import { SiteNavigation } from "@/components/layout/site-navigation";
import { loadMarketplaceCourses } from "@/lib/courses.functions";

export const Route = createFileRoute("/")({
  loader: () => loadMarketplaceCourses(),
  staleTime: 60_000,
  component: DojosPage,
});

function DojosPage() {
  const courses = Route.useLoaderData();
  const [language, setLanguage] = useState("all");
  const [framework, setFramework] = useState("all");
  const [sortBy, setSortBy] = useState("popularity");

  const languages = useMemo(
    () => [...new Set(courses.map((course) => course.language))].sort(),
    [courses],
  );
  const frameworks = useMemo(
    () => [...new Set(courses
      .filter((course) => language === "all" || course.language === language)
      .flatMap((course) => course.framework ? [course.framework] : []))].sort(),
    [courses, language],
  );
  const visibleCourses = useMemo(() => courses
    .filter((course) => language === "all" || course.language === language)
    .filter((course) => framework === "all" || course.framework === framework)
    .sort((left, right) => {
      if (sortBy === "newest") {
        return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
      }
      if (sortBy === "trending") return left.trendingRank - right.trendingRank;
      return right.installs - left.installs;
    }), [courses, framework, language, sortBy]);

  const selectLanguage = (value: string) => {
    setLanguage(value);
    setFramework("all");
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNavigation />

      <section className="marketplace-lined-frame mx-auto max-w-(--fd-layout-width) px-4 sm:px-5">
        <div className="marketplace-lined-surface min-h-[calc(100vh-4rem)]">
          <div className="min-w-0 px-5 py-12 lg:px-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-2xl">
                <h1 className="text-4xl font-medium tracking-tight">Dojos</h1>
                <p className="mt-3 font-prose text-base leading-7 text-muted-foreground">
                  Dojos are AI-assisted courses. Add them via CLI and let your agent guide you through katas, learning material, and interactive teaching dialogues.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={language} onValueChange={selectLanguage} size="compact">
                  <SelectTrigger aria-label="Filter by language" className="min-w-[10rem]" />
                  <SelectContent>
                    <SelectItem index={0} value="all">All languages</SelectItem>
                    {languages.map((item, index) => (
                      <SelectItem key={item} index={index + 1} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={framework} onValueChange={setFramework} size="compact">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={language}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.16 }}
                    >
                      <SelectTrigger aria-label="Filter by framework" className="min-w-[10rem]" />
                    </motion.div>
                  </AnimatePresence>
                  <SelectContent>
                    <SelectItem index={0} value="all">All frameworks</SelectItem>
                    {frameworks.map((item, index) => (
                      <SelectItem key={item} index={index + 1} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={setSortBy} size="compact">
                  <SelectTrigger
                    aria-label="Sort dojos"
                    icon={ArrowUpDown}
                    className="min-w-[9.5rem]"
                  />
                  <SelectContent>
                    <SelectItem index={0} value="newest">Newest</SelectItem>
                    <SelectItem index={1} value="popularity">Popularity</SelectItem>
                    <SelectItem index={2} value="trending">Trending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-10 min-w-0">
              <CardGroup columns={3} separated proximityHover={false} border="outlined" className="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleCourses.map((course) => <CourseCard key={course.id} course={course} />)}
              </CardGroup>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
