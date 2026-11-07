import { createFileRoute, redirect } from "@tanstack/react-router";

/** /settings opens its first section; the old `?tab=` address keeps its section */
export const Route = createFileRoute("/settings/")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => typeof search.tab === "string" ? { tab: search.tab } : {},
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/settings/$section", params: { section: search.tab === "General" ? "profile" : "theme" }, replace: true });
  },
});
