import { createFileRoute, redirect } from "@tanstack/react-router";

/** The old learning address: its links already pass a run id, so it goes to `/learn/$runId`, whose loader sends an id that is not a run
 *  to the dashboard (D30) */
export const Route = createFileRoute("/session/$sessionId")({
  beforeLoad: ({ params }) => { throw redirect({ to: "/learn/$runId", params: { runId: params.sessionId }, replace: true }); },
});
