import { createFileRoute } from "@tanstack/react-router";
import { PricingPage } from "@dojofoo/uix/web/pricing";

// Not linked from anywhere yet, and kept out of search results until it is
export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [{ title: "Pricing · dojofoo" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PricingPage,
});
