import { useEffect, useMemo, useState } from "react";
import { Icon } from "~/components/app-shell";
import { CourseArt } from "~/components/course-card";
import { SiteSearchPalette, type SearchScope } from "~/components/site-search-palette";
import { BookOpen01Icon } from "~/lib/icons";
import { allPages, headingsOf } from "~/docs/content";
import { catalog, type WebCourse } from "./catalog";

export type { SearchScope } from "~/components/site-search-palette";

type Hit = { key: string; title: string; context: string; href?: string; course?: WebCourse };

const words = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);
const has = (text: string, terms: string[]) => terms.every((term) => text.toLowerCase().includes(term));

function searchDocs(query: string): Hit[] {
  const terms = words(query);
  if (!terms.length) return allPages.filter(({ page, section }) => section.groups[0].pages[0] === page).map(({ page, section }) => ({ key: page.path, title: page.title, context: section.title, href: page.path }));
  const hits: Array<Hit & { score: number }> = [];
  for (const { page, section } of allPages) {
    if (has(`${page.title} ${page.description ?? ""}`, terms)) hits.push({ key: page.path, title: page.title, context: page.description ?? section.title, href: page.path, score: 3 });
    for (const heading of headingsOf(page.body)) {
      if (has(heading.text, terms)) hits.push({ key: `${page.path}#${heading.id}`, title: heading.text, context: `${section.title} · ${page.title}`, href: `${page.path}#${heading.id}`, score: 2 });
    }
    if (!hits.some((hit) => hit.key.startsWith(page.path)) && has(page.body, terms)) hits.push({ key: page.path, title: page.title, context: `${section.title} · mentions “${query.trim()}”`, href: page.path, score: 1 });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 12);
}

function searchCourses(query: string): Hit[] {
  const terms = words(query);
  return catalog
    .filter((course) => has([course.name, course.description, course.repository, course.language, course.framework ?? "", ...course.tags].join(" "), terms))
    .sort((a, b) => b.metrics.installs - a.metrics.installs)
    .slice(0, 8)
    .map((course) => ({ key: course.id, title: course.name, context: `${course.language} · ${course.repository}`, course }));
}

export function SearchDialog({ open, scope: initialScope, onClose, onOpenDoc, onOpenCourse }: {
  open: boolean;
  scope: SearchScope;
  onClose: () => void;
  onOpenDoc: (href: string) => void;
  onOpenCourse: (course: WebCourse) => void;
}) {
  const [scope, setScope] = useState(initialScope);
  const [query, setQuery] = useState("");
  useEffect(() => { if (open) { setScope(initialScope); setQuery(""); } }, [open, initialScope]);
  const hits = useMemo(() => scope === "docs" ? searchDocs(query) : searchCourses(query), [scope, query]);
  return <SiteSearchPalette open={open} onOpenChange={next => { if (!next) onClose(); }} scope={scope} onScopeChange={setScope}
    query={query} onQueryChange={setQuery} emptyMessage={`No ${scope === "docs" ? "documentation" : "courses"} found.`}
    groups={[{ id: scope, label: scope === "docs" ? "Documentation" : "Courses", commands: hits.map(hit => ({
      id: hit.key, label: hit.title, hint: hit.context,
      icon: hit.course ? <CourseArt art={hit.course.art} size={26} /> : <Icon icon={BookOpen01Icon} size={17} />,
    })) }]}
    onRun={id => { const hit = hits.find(hit => hit.key === id); if (hit?.course) onOpenCourse(hit.course); else if (hit?.href) onOpenDoc(hit.href); }} />;
}
