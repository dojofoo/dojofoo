import { queryOptions } from "@tanstack/react-query";
import { Client, type SessionStreamEvent } from "@dojofoo/harness/client";
import type { InteractiveSnapshot } from "@/server/interactive/service";
import type { LessonSnapshot } from "@/server/lesson/service";
import type { InstalledCourse } from "@/routes/course.$courseId";

/** A run id that names no installed course: the learn route sends it to the dashboard (D33). */
export class RunNotFound extends Error {}

async function read<T>(url: string, signal: AbortSignal, fallback: string): Promise<T> {
  const response = await fetch(url, { signal });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? fallback);
  return body;
}
const courseApi = (workspace: string, course: string) => `/api/workspaces/${encodeURIComponent(workspace)}/courses/${encodeURIComponent(course)}`;
const agentApi = (workspace: string, path: string) => `/api/v1/workspaces/${encodeURIComponent(workspace)}${path}`;

/** A course run (D30): which installed course, in which workspace, at which kata lesson. */
export const runQuery = (runId: string) => queryOptions({
  queryKey: ["learn", "run", runId],
  queryFn: async ({ signal }) => {
    const response = await fetch(`/api/control/learning-sessions/${encodeURIComponent(runId)}`, { signal });
    if (response.status === 404) throw new RunNotFound(runId);
    const body = await response.json() as InstalledCourse & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "This course session is no longer available.");
    return body;
  },
});

/** An interactive course's outline, current lesson and slide. */
export const interactiveQuery = (workspace: string, course: string) => queryOptions({
  queryKey: ["learn", "interactive", workspace, course],
  queryFn: ({ signal }) => read<InteractiveSnapshot>(`${courseApi(workspace, course)}/interactive`, signal, "This course session is no longer available."),
});

/** A kata lesson's outline, file and latest check, without preparing its workspace. */
export const lessonQuery = (workspace: string, course: string, lesson: string) => queryOptions({
  queryKey: ["learn", "lesson", workspace, course, lesson],
  queryFn: ({ signal }) => read<LessonSnapshot>(`${courseApi(workspace, course)}/lessons/${encodeURIComponent(lesson)}?prepare=false`, signal, "This course session is no longer available."),
});

/** The page's newest Sensei conversation and its stream up to now, or null before the page has one. Reading creates nothing:
 *  only the page's own POST /sessions/default does (D29). The chat starts from these events and follows the stream from
 *  `streamIndex`, so it does not replay the conversation. */
export type PreloadedConversation = { session: { id: string; agent: string; model?: string }; events: SessionStreamEvent[]; streamIndex: number };
export const conversationQuery = (workspace: string, page: { course: string; lesson?: string }) => queryOptions<PreloadedConversation | null>({
  queryKey: ["learn", "conversation", workspace, page.course, page.lesson ?? ""],
  // An older read is still a correct start: the chat follows the stream from its line, so it never needs reading again. A page
  // without a conversation yet is read again next time.
  staleTime: query => query.state.data ? Infinity : 0,
  queryFn: async ({ signal }): Promise<PreloadedConversation | null> => {
    const search = new URLSearchParams({ persona: "sensei", course: page.course, lesson: page.lesson ?? "", per_page: "1" });
    const sessions = await read<{ data: Array<{ id: string; agent: string; model?: string }> }>(agentApi(workspace, `/sessions?${search}`), signal, "Sensei's conversations could not be listed.");
    const session = sessions.data[0];
    if (!session) return null;
    const client = new Client({ baseUrl: agentApi(workspace, `/sessions/${encodeURIComponent(session.id)}`) });
    const events: SessionStreamEvent[] = [];
    for await (const event of client.sessions.attach(session.id).stream({ follow: false, reconnect: false, signal })) events.push(event);
    // The line after the last one read; a line that emitted no events is covered by the reader's `next`
    const last = events.at(-1)?.meta;
    const streamIndex = last ? last.next ?? last.position.line + 1 : 0;
    return { session: { id: session.id, agent: session.agent, ...(session.model ? { model: session.model } : {}) }, events, streamIndex };
  },
});
