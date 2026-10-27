"use client";
import type { SharedProps } from "fumadocs-ui/contexts/search";
import { useDocsSearch } from "fumadocs-core/search/client";
import { staticClient } from "fumadocs-core/search/client/orama-static";
import { useI18n } from "fumadocs-ui/contexts/i18n";
import { usePathname } from "fumadocs-core/framework";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteSearchPalette, type SearchScope } from "@dojofoo/uix/components/site-search-palette";
import { searchMarketplaceCourses, type CourseListing } from "@/lib/courses";

const plainText = (text: string) => text.replace(/<\/?mark>/g, "");
const resultIcon = <svg className="ui-cm__glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4" /></svg>;

export default function SiteSearchDialog({ open, onOpenChange }: SharedProps) {
  const pathname = usePathname();
  const initialScope: SearchScope = pathname === "/" || pathname === "/dojos" || pathname.startsWith("/courses") ? "courses" : "docs";
  const [scope, setScope] = useState(initialScope);
  const [search, setSearch] = useState("");
  const [courses, setCourses] = useState<CourseListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const { locale } = useI18n();
  const docs = useDocsSearch({ client: staticClient({ locale }) });
  const navigate = useNavigate();

  useEffect(() => { if (open) { setScope(initialScope); setSearch(""); } }, [open, initialScope]);
  useEffect(() => { docs.setSearch(open && scope === "docs" ? search : ""); }, [open, scope, search, docs.setSearch]);
  useEffect(() => {
    setCourses([]);
    setFailed(false);
    if (!open || scope !== "courses" || search.trim().length < 2) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchMarketplaceCourses(search.trim())
        .then(results => { if (active) setCourses(results); })
        .catch(() => { if (active) setFailed(true); })
        .finally(() => { if (active) setLoading(false); });
    }, 150);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, scope, search]);

  const results = scope === "courses"
    ? courses.map(course => ({ id: course.id, label: course.name, hint: course.source, url: `/courses/${course.source}/${course.slug}` }))
    : (docs.query.data === "empty" ? [] : docs.query.data ?? []).map(result => ({
      id: result.id, label: plainText(result.content), hint: result.breadcrumbs?.map(plainText).join(" › "), url: result.url,
    }));
  const emptyMessage = scope === "courses"
    ? search.trim().length < 2 ? "Type at least two characters to search courses." : loading ? "Searching courses…" : failed ? "Course search is unavailable. Try again." : "No courses found."
    : docs.query.isLoading ? "Searching documentation…" : docs.query.error ? "Documentation search is unavailable. Try again." : search.trim() ? "No documentation found." : "Search documentation by title, topic or command.";

  return <SiteSearchPalette open={open} onOpenChange={onOpenChange} scope={scope} onScopeChange={setScope}
    query={search} onQueryChange={setSearch} emptyMessage={emptyMessage}
    groups={[{ id: scope, label: scope === "courses" ? "Courses" : "Documentation", commands: results.map(result => ({ ...result, icon: resultIcon })) }]}
    onRun={id => { const result = results.find(result => result.id === id); if (result) void navigate({ to: result.url }); }} />;
}
