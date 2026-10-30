import { useMemo, useState } from "react";
import { EmptyState, Icon, MenuButton } from "../components/app-shell";
import { Button } from "../components/button";
import { ArrowUpDownIcon, Cancel01Icon, Search01Icon } from "../lib/icons";
import { cn } from "../lib/utils";
import { teachingModes, type TeachingMode, type WebCourse } from "./catalog";
import { CourseTile } from "./course-tile";
import { PageHead, SitePage, useSite } from "./site";

/*
 * Courses: the catalog as a search, laid out as the site's "All dojos" (apps/web/src/routes/dojos.tsx) – on the page,
 * not in a window: the filters in a sidebar (teaching style, language, framework), the search and the sort over the
 * results, and the results as Explore draws them (each course's color card). The query reads a course's name,
 * description, repository, language, framework and tags.
 */

type Sort = "popularity" | "trending" | "newest" | "rating";

const sorts: Array<{ value: Sort; label: string }> = [
  { value: "popularity", label: "Most installed" },
  { value: "trending", label: "Trending" },
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Top rated" },
];

export function CoursesPage({ courses, initialQuery = "" }: { courses: WebCourse[]; initialQuery?: string }) {
  const links = useSite();
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<TeachingMode | "all">("all");
  const [language, setLanguage] = useState("all");
  const [framework, setFramework] = useState("all");
  const [sort, setSort] = useState<Sort>("popularity");
  const languages = useMemo(() => [...new Set(courses.map((course) => course.language))].sort(), [courses]);
  const frameworks = useMemo(() => [...new Set(courses.flatMap((course) => (course.framework ? [course.framework] : [])))].sort(), [courses]);
  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return courses
      .filter((course) => mode === "all" || course.mode === mode)
      .filter((course) => language === "all" || course.language === language)
      .filter((course) => framework === "all" || course.framework === framework)
      .filter((course) => {
        const text = [course.name, course.description, course.repository, course.language, course.framework ?? "", ...course.tags].join(" ").toLowerCase();
        return words.every((word) => text.includes(word));
      })
      .sort((a, b) => sort === "newest" ? b.publishedAt.localeCompare(a.publishedAt)
        : sort === "trending" ? a.trendingRank - b.trendingRank
        : sort === "rating" ? (b.rating ?? -1) - (a.rating ?? -1)
        : b.metrics.installs - a.metrics.installs);
  }, [courses, query, mode, language, framework, sort]);
  const filtered = query !== "" || mode !== "all" || language !== "all" || framework !== "all";
  const clear = () => { setQuery(""); setMode("all"); setLanguage("all"); setFramework("all"); };

  return (
    <SitePage current="courses" window={false}>
      <style href="ui-web-courses" precedence="default">{css}</style>
      <div className="ui-crs">
        <PageHead kicker="Courses" title="Find your dojo" lead="A dojo is an installable free or premium-hosted package with its own sensei. It learns how you learn, then guides you through coding katas, interactive lessons, capstone projects or even interviews." />
        <div className="ui-crs-layout">
          <aside className="ui-crs-side scroll-fade" aria-label="Filters">
            <FilterList label="Teaching style" value={mode} onChange={(value) => setMode(value as TeachingMode | "all")}
              options={[{ value: "all", label: "Any" }, ...teachingModes.map((item) => ({ value: item.value, label: item.label, title: item.description }))]} />
            <FilterList label="Language" value={language} onChange={setLanguage} options={[{ value: "all", label: "Any" }, ...languages.map((item) => ({ value: item, label: item }))]} />
            <FilterList label="Framework" value={framework} onChange={setFramework} options={[{ value: "all", label: "Any" }, ...frameworks.map((item) => ({ value: item, label: item }))]} />
          </aside>

          <div className="ui-crs-main">
            <div className="ui-crs-bar">
              <label className="ui-crs-search">
                <Icon icon={Search01Icon} size={16} />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setQuery("")}
                  placeholder="Search by name, language, framework or topic" aria-label="Search courses" />
                {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><Icon icon={Cancel01Icon} size={13} /></button>}
              </label>
              <MenuButton label="Sort courses" value={sort} options={sorts.filter(item => item.value !== "rating" || courses.some(course => course.rating !== undefined))} onChange={setSort} icon={ArrowUpDownIcon} className="ui-crs-sort" />
            </div>
            <div className="ui-crs-count">
              <p aria-live="polite">{results.length === 1 ? "1 course" : `${results.length} courses`}{query && <> for <b>“{query.trim()}”</b></>}</p>
              {filtered && <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button>}
            </div>
            {results.length > 0 ? (
              <div className="ui-crs-grid">{results.map((course) => <CourseTile key={course.id} course={course} href={links.courseHref(course)} onOpen={links.openCourse} />)}</div>
            ) : (
              <EmptyState title="No courses found" text="Don’t panic – we’re creating new ones. Try another word, or clear the filters." action={<Button variant="secondary" size="sm" onClick={clear}>Clear filters</Button>} tall />
            )}
          </div>
        </div>
      </div>
    </SitePage>
  );
}

/** A filter as the site's sidebar has them: its name, then its choices, the picked one marked */
function FilterList({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string; title?: string }> }) {
  return (
    <nav className="ui-crs-filter" aria-label={label}>
      <span className="ui-crs-filter__label">{label}</span>
      {/* The choices on their own, so on a phone they scroll sideways under a name that stays */}
      <div className="ui-crs-filter__options scroll-fade-x">
        {options.map((option) => (
          <button key={option.value} type="button" className={cn("ui-crs-filter__option", option.value === value && "ui-crs-filter__option--on")}
            aria-pressed={option.value === value} title={option.title} onClick={() => onChange(option.value)}>{option.label}</button>
        ))}
      </div>
    </nav>
  );
}

const css = /* css */ `
/* On the page: the head, then the sidebar beside the results */
.ui-crs { max-width: 1280px; margin: 0 auto; padding: 40px 8px 32px; }
@media (max-width: 1303px) { .ui-crs { padding-inline: 20px; } }
.ui-crs-layout { display: grid; grid-template-columns: 13rem minmax(0, 1fr); gap: 40px; margin-top: 36px; }
@media (max-width: 760px) { .ui-crs-layout { grid-template-columns: minmax(0, 1fr); gap: 24px; } }

/* The sidebar: each filter's name, its choices as rows, the picked one as the shell's selected row */
.ui-crs-side { position: sticky; top: 16px; align-self: start; display: grid; gap: 24px; max-height: calc(100dvh - 32px); overflow-y: auto; }
.ui-crs-filter, .ui-crs-filter__options { display: grid; gap: 1px; }
.ui-crs-filter__label { margin: 0 0 6px 10px; color: var(--muted); font-size: var(--fs-caption); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
.ui-crs-filter__option { height: 30px; padding: 0 10px; border-radius: calc(8px * var(--squircle-factor, 1)); color: var(--muted); font-size: var(--fs-subtitle); text-align: left; transition: background-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard); }
.ui-crs-filter__option:hover { background: var(--hover); color: var(--ink); }
.ui-crs-filter__option--on, .ui-crs-filter__option--on:hover { background: var(--select); color: var(--ink); font-weight: 550; }

/* The search and the sort over the results */
.ui-crs-bar { display: flex; align-items: center; gap: 10px; }
.ui-crs-search { display: flex; flex: 1; align-items: center; gap: 10px; min-width: 0; height: 42px; padding: 0 8px 0 14px; border-radius: calc(12px * var(--squircle-factor, 1)); background: var(--surface-3); box-shadow: var(--shadow-2); color: var(--muted); transition: box-shadow var(--motion-fast) var(--ease-standard); }
.ui-crs-search:focus-within { box-shadow: var(--shadow-2), 0 0 0 2px var(--accent); }
.ui-crs-search input { flex: 1; min-width: 0; height: 100%; border: 0; background: none; color: var(--ink); font: inherit; font-size: 14px; outline: none; }
.ui-crs-search input::placeholder { color: var(--placeholder); }
.ui-crs-search input::-webkit-search-cancel-button { display: none; }
.ui-crs-search button { display: grid; place-items: center; width: 26px; height: 26px; border-radius: calc(4px * var(--squircle-factor, 1)); }
.ui-crs-search button:hover { background: var(--hover); color: var(--ink); }
/* On a phone the sort is its icon in a box as tall as the search: what it sorts by shows in its menu (and its name) */
@media (max-width: 760px) {
  .ui-crs-sort.ui-as-tool { justify-content: center; gap: 0; width: 42px; height: 42px; padding: 0; border-radius: calc(12px * var(--squircle-factor, 1)); background: var(--surface-3); box-shadow: var(--shadow-2); font-size: 0; }
  .ui-crs-sort > svg:last-child { display: none; }
}
.ui-crs-count { display: flex; align-items: center; gap: 8px; min-height: 32px; margin: 18px 0 14px; }
.ui-crs-count p { flex: 1; margin: 0; color: var(--muted); font-size: var(--fs-body); }
.ui-crs-count p b { color: var(--ink); font-weight: 550; }

.ui-crs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 14.5rem), 1fr)); gap: 20px 16px; }
/* Its edges fade only where it scrolls: a mask anywhere else would clip what it paints past its box */
@media (min-width: 761px) { .ui-crs-filter__options.scroll-fade-x { -webkit-mask-image: none; mask-image: none; } }
/* On a phone each filter is one row: its name a header that stays (the names one column, so the choices line up), its
   choices scrolling sideways beside it, so the results aren't pushed a screen down */
@media (max-width: 760px) {
  .ui-crs-side { position: static; grid-template-columns: auto minmax(0, 1fr); gap: 12px 10px; max-height: none; overflow: visible; }
  .ui-crs-side.scroll-fade { -webkit-mask-image: none; mask-image: none; }
  .ui-crs-filter { grid-column: 1 / -1; grid-template-columns: subgrid; align-items: center; }
  .ui-crs-filter__label { margin: 0; }
  .ui-crs-filter__options { display: flex; gap: 4px; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; }
  .ui-crs-filter__option { flex: none; }
}
`;
