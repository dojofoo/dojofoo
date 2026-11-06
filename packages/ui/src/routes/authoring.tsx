import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { WorkspaceSkeleton } from "@dojofoo/uix/components/workspace-skeleton";

/** The old authoring addresses (D30): `?workspace=` goes to `/authoring/$draftId` with its session, `?session=` alone to the dashboard,
 *  and bare `/authoring` (what `dojofoo ui --authoring` opens) to the launch folder's draft, else the dashboard. A component, never a
 *  loader: reading the launch folder must not run on a preload. */
export const Route = createFileRoute("/authoring")({
  component: AuthoringRedirect,
  validateSearch: (search: Record<string, unknown>): { workspace?: string; session?: string } => ({
    ...(typeof search.workspace === "string" ? { workspace: search.workspace } : {}),
    ...(typeof search.session === "string" ? { session: search.session } : {}),
  }),
});

function AuthoringRedirect() {
  const navigate = useNavigate();
  const { workspace, session } = Route.useSearch();
  useEffect(() => {
    if (workspace) {
      void navigate({ to: "/authoring/$draftId", params: { draftId: workspace }, search: session ? { session } : {}, replace: true });
      return;
    }
    if (session) {
      void navigate({ to: "/", replace: true });
      return;
    }
    const controller = new AbortController();
    const read = <T,>(url: string) => fetch(url, { signal: controller.signal }).then(response => response.ok ? response.json() as Promise<T> : undefined);
    // The launch folder's draft, registered by `dojofoo ui --authoring` before it opened this page (decision 4)
    void Promise.all([read<{ root: string }>("/api/authoring/draft"), read<Array<{ workspaceId: string; path: string }>>("/api/control/authoring")])
      .then(([draft, drafts]) => drafts?.find(item => item.path === draft?.root)?.workspaceId, () => undefined)
      .then(draftId => {
        if (controller.signal.aborted) return;
        void navigate(draftId ? { to: "/authoring/$draftId", params: { draftId }, replace: true } : { to: "/", replace: true });
      });
    return () => controller.abort();
  }, [workspace, session, navigate]);
  return <WorkspaceSkeleton label="Opening the draft" />;
}
