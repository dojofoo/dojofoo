import { createFileRoute, redirect } from "@tanstack/react-router";

/** /settings opens its first section */
export const Route = createFileRoute("/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/$section", params: { section: "theme" }, replace: true });
  },
});
