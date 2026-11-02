import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/interactive")({
  validateSearch: (search: Record<string, unknown>) => ({
    course: typeof search.course === "string" ? search.course : undefined,
  }),
  beforeLoad: ({ search }) => { throw redirect(search.course ? { to: "/course/$courseId", params: { courseId: search.course } } : { to: "/" }); },
});
