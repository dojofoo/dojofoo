import browserCollections from "collections/browser";
import { Suspense } from "react";
import { compareComponents, ComparePage, rivalMarks, type Rival } from "@dojofoo/uix/web/compare";

const clientLoader = browserCollections.comparisons.createClientLoader({
  component: ({ default: MDX }) => <MDX components={compareComponents} />,
});

export const preloadComparison = (path: string) => clientLoader.preload(path);

export function ComparisonPageContent({ id, path, rival, headings }: {
  id: string;
  path: string;
  rival: Rival;
  headings: { id: string; html: string }[];
}) {
  const toc = headings.map(heading => ({ id: heading.id, text: <span dangerouslySetInnerHTML={{ __html: heading.html }} /> }));
  return <ComparePage rival={rival} marks={rivalMarks[id]} toc={toc}>
    <Suspense>{clientLoader.useContent(path)}</Suspense>
  </ComparePage>;
}
