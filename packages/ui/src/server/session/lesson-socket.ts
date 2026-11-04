import type { AgentRuntime } from "@dojofoo/agent/api";
import { offerCheckReport, runLessonCheck } from "../agent-session/check-reports";
import { takeNotices } from "../agent-session/guard-store";
import type { PageKey } from "../agent-session/notify";
import { presence } from "../agent-session/presence";
import { resolveWorkspaceId } from "../control/workspace";
import { SessionChannel, type SessionPeer } from "./delivery";
import { error, notification, parseRequest, result, type JsonRpcId } from "./protocol";

/** A lesson or course page socket (`/api/session`): `workspace`, `course` and, for a kata lesson, `lesson` in the query. */
export type LessonSocketPeer = SessionPeer & { id: string };

export function pageKeyOf(request: Request): PageKey | undefined {
  const query = new URL(request.url).searchParams;
  const workspaceId = query.get("workspace");
  const courseId = query.get("course");
  if (!workspaceId || !courseId) return undefined;
  const lessonId = query.get("lesson");
  return { workspaceId, courseId, ...(lessonId ? { lessonId } : {}) };
}

export function createLessonSocket(deps: { runtime: Pick<AgentRuntime, "connect">; root?(workspaceId: string): string }) {
  const root = deps.root ?? ((workspaceId: string) => resolveWorkspaceId(workspaceId));
  return {
    /** A foreign Origin and a request without a page key are refused */
    upgrade(request: Request): void {
      const origin = request.headers.get("origin");
      if (origin && new URL(origin).host !== new URL(request.url).host) throw new Response("Forbidden", { status: 403 });
      if (!pageKeyOf(request)) throw new Response("A workspace and course are required", { status: 400 });
    },
    /** Joins the page key, then sends the guard notices raised while no socket for it was open (decision 19) */
    async open(peer: LessonSocketPeer): Promise<void> {
      new SessionChannel(peer).send(notification("session.snapshot", {}));
      const key = pageKeyOf(peer.request);
      if (!key) return;
      await presence().join(key, peer);
      if (!key.lessonId) return;
      try {
        for (const { violation } of await takeNotices(root(key.workspaceId), key.courseId, key.lessonId)) peer.send(JSON.stringify(notification("guard.violation", violation)));
      } catch (cause) {
        console.warn(`Could not read the guard notices of ${key.courseId}/${key.lessonId}: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    },
    close(peer: LessonSocketPeer): void {
      const key = pageKeyOf(peer.request);
      if (key) presence().part(key, peer);
    },
    /** `lesson.check`: the lesson's checks, then the report to Sensei (constraint 3) */
    async message(peer: LessonSocketPeer, text: string): Promise<void> {
      let requestId: JsonRpcId | null = null;
      const channel = new SessionChannel(peer);
      try {
        const request = parseRequest(text);
        requestId = request.id ?? null;
        if (request.method !== "lesson.check") {
          if (request.id !== undefined) channel.send(error(request.id, -32_601, `Unknown method: ${request.method}`));
          return;
        }
        const params = request.params as { courseId?: string; lessonId?: string };
        if (!params.courseId || !params.lessonId) throw new Error("A course and lesson are required");
        const key = pageKeyOf(peer.request)!;
        const target = { path: root(key.workspaceId), workspaceId: key.workspaceId };
        const checked = await runLessonCheck(target, params.courseId, params.lessonId);
        if (request.id !== undefined) channel.send(result(request.id, checked.observation.report));
        await offerCheckReport(deps.runtime, target, params.courseId, params.lessonId, checked.observation);
      } catch (cause) {
        channel.send(error(requestId, -32_000, cause instanceof Error ? cause.message : "Session request failed"));
      }
    },
  };
}
