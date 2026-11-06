/** A page key: a kata lesson page `(workspace, course, lesson)` or an interactive course page `(workspace, course)`. */
export interface PageKey { workspaceId: string; courseId: string; lessonId?: string }
/** A JSON-RPC notification for a page's sockets (packages/ui/src/server/session/protocol.ts). */
export interface PageMessage { method: string; params: unknown }
/** Sends to every socket open for the page key; answers whether any was open. */
export type PageSink = (key: PageKey, message: PageMessage) => boolean;

const sinkKey = Symbol.for("dojofoo.page-sink");
type Holder = { sink?: PageSink };
// Process-global: route modules may be loaded twice by the dev runner
const holder = ((globalThis as Record<symbol, unknown>)[sinkKey] ??= {}) as Holder;

/** The lesson socket connects its peers here (commit 8); until then nothing is open. */
export function setPageSink(sink: PageSink | undefined): void {
  holder.sink = sink;
}

export function notifyPage(key: PageKey, method: string, params: unknown): boolean {
  try { return holder.sink?.(key, { method, params }) ?? false; }
  catch (error) {
    console.warn(`Could not notify the page ${key.courseId}/${key.lessonId ?? ""}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

export const pageKeyOf = (workspaceId: string, record: { courseId?: string; lessonId?: string }): PageKey | undefined =>
  record.courseId ? { workspaceId, courseId: record.courseId, ...(record.lessonId ? { lessonId: record.lessonId } : {}) } : undefined;
export const samePage = (a: PageKey, b: PageKey) => a.workspaceId === b.workspaceId && a.courseId === b.courseId && (a.lessonId ?? "") === (b.lessonId ?? "");
