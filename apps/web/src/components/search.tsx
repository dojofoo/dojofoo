'use client';
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SearchItemType,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';
import { useDocsSearch } from 'fumadocs-core/search/client';
import { staticClient } from 'fumadocs-core/search/client/orama-static';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import { usePathname } from 'fumadocs-core/framework';
import { useEffect, useState } from 'react';
import { searchMarketplaceCourses } from '@/lib/courses';

function DocsSearchDialog(props: SharedProps) {
  const { locale } = useI18n();
  const { search, setSearch, query } = useDocsSearch({
    client: staticClient({ locale }),
  });

  return (
    <SearchDialog search={search} onSearchChange={setSearch} isLoading={query.isLoading} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={query.data !== 'empty' ? query.data : null} />
      </SearchDialogContent>
    </SearchDialog>
  );
}

function CourseSearchDialog(props: SharedProps) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<SearchItemType[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setItems(null);
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    searchMarketplaceCourses(query)
      .then((courses) => {
        if (!active) return;
        setItems(courses.map((course) => ({
          id: course.id,
          type: 'page',
          content: course.name,
          breadcrumbs: ['Courses'],
          url: `/courses/${course.source}/${course.slug}`,
        })));
      })
      .catch(() => {
        if (active) setItems([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search]);

  return (
    <SearchDialog
      search={search}
      onSearchChange={setSearch}
      isLoading={isLoading}
      {...props}
    >
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput aria-label="Search courses" />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={items} />
      </SearchDialogContent>
    </SearchDialog>
  );
}

export default function SiteSearchDialog(props: SharedProps) {
  const pathname = usePathname();
  const courseSearch = pathname === '/' || pathname.startsWith('/courses/');
  return courseSearch ? <CourseSearchDialog {...props} /> : <DocsSearchDialog {...props} />;
}
