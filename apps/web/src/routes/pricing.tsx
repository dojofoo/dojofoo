import { createFileRoute, notFound } from "@tanstack/react-router";
import { PricingPage } from "@dojofoo/uix/web/pricing";
import { loadPricingFlag } from "@/lib/feature-flags.functions";

// Not linked from anywhere yet, and kept out of search results until it is; without DOJO_PRICING it doesn't exist
export const Route = createFileRoute("/pricing")({
  loader: async () => {
    if (!(await loadPricingFlag())) throw notFound();
    return { open: true };
  },
  // Closed, the 404 keeps the site's own title
  head: ({ loaderData }) => loaderData ? { meta: [{ title: "Pricing · Dojo.foo" }, { name: "robots", content: "noindex, nofollow" }] } : {},
  component: PricingPage,
});
