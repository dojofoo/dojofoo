import { createFileRoute, notFound } from "@tanstack/react-router";
import { ComparePage, rivals } from "@dojofoo/uix/web/compare";

// Dojo.foo next to another way to learn, e.g. /vs/masterclass. Not linked from anywhere and kept out of search
// (noindex, not in the sitemap) until the other side's column is confirmed
export const Route = createFileRoute("/vs/$rival")({
  loader: ({ params }) => {
    if (!rivals.some((rival) => rival.id === params.rival)) throw notFound();
    return params.rival;
  },
  head: ({ loaderData }) => {
    const rival = rivals.find((item) => item.id === loaderData);
    return rival ? { meta: [{ title: `Dojo.foo vs ${rival.name}` }, { name: "robots", content: "noindex, nofollow" }] } : {};
  },
  component: function Compare() {
    const id = Route.useLoaderData();
    return <ComparePage rival={rivals.find((rival) => rival.id === id)!} />;
  },
});
