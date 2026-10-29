import { createFileRoute } from "@tanstack/react-router";
import { InteractiveCourse } from "@/components/interactive-course";

export const Route = createFileRoute("/interactive")({
  validateSearch: (search: Record<string, unknown>) => ({
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    course: typeof search.course === "string" ? search.course : undefined,
  }),
  component: InteractiveRoute,
});

function InteractiveRoute() {
  return <InteractiveCourse {...Route.useSearch()} />;
}
