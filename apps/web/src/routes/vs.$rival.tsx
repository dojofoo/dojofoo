import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import browserCollections from "collections/browser";
import { Suspense } from "react";
import { compareComponents, ComparePage, rivalMarks } from "@dojofoo/uix/web/compare";

// Dojo.foo next to another way to learn, e.g. /vs/masterclass: a page of comparisons/<rival>.mdx. Hidden for now: not
// linked from anywhere and kept out of search (noindex, not in the sitemap)
export const Route = createFileRoute("/vs/$rival")({
  loader: async ({ params }) => {
    const data = await loader({ data: params.rival });
    await clientLoader.preload(data.path);
    return data;
  },
  head: ({ loaderData }) => loaderData ? { meta: [{ title: `Dojo.foo vs ${loaderData.rival.name}` }, { name: "robots", content: "noindex, nofollow" }] } : {},
  component: function Compare() {
    const { id, path, rival, headings } = Route.useLoaderData();
    const toc = headings.map((heading) => ({ id: heading.id, text: <span dangerouslySetInnerHTML={{ __html: heading.html }} /> }));
    return (
      <ComparePage rival={rival} marks={rivalMarks[id]} toc={toc}>
        <Suspense>{clientLoader.useContent(path)}</Suspense>
      </ComparePage>
    );
  },
});

const loader = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    // Lazily, so the server collection (node:path) stays out of the browser bundle
    const { comparisons } = await import("collections/server");
    const page = comparisons.find((item) => item.info.path === `${id}.mdx`);
    if (!page) throw notFound();
    const { renderToStaticMarkup } = await import("react-dom/server");
    return {
      id,
      path: page.info.path,
      rival: { name: page.name, website: page.website, headline: page.title, lead: page.description, sources: page.sources },
      headings: page.toc.filter((heading) => heading.depth === 2).map((heading) => ({ id: heading.url.slice(1), html: renderToStaticMarkup(heading.title) })),
    };
  });

const clientLoader = browserCollections.comparisons.createClientLoader({
  component: ({ default: MDX }) => <MDX components={compareComponents} />,
});
