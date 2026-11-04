import { defineDynamic, defineTool } from "@dojofoo/agent/tools";
import { lessonCapabilities, uiCapabilities, type LessonCheck, type SenseiSessionInfo } from "@dojofoo/protocol";
import { z } from "zod";
import { senseiHostPort, type SenseiRuntime } from "./agent.ts";

type Runtime = () => Promise<Pick<SenseiRuntime, "hostPort">>;
type Kata = "check" | "observe" | "show";

const observation = z.object({
  category: z.enum(["uncertainty", "understanding", "misconception", "support", "transfer"]),
  interpretation: z.string().trim().min(1).max(240),
  status: z.enum(["active", "resolved"]),
  source: z.object({ sessionId: z.string(), messageId: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
  replaces: z.string().optional(),
}).strict();

const tools = {
  check: { description: lessonCapabilities.check.description, inputSchema: z.object({}).strict(), label: "Checking the learner's work" },
  observe: { description: lessonCapabilities.observe.description, inputSchema: observation, label: "Noting what the learner shows" },
  show: { description: uiCapabilities.show.description, inputSchema: z.object({ fragmentId: z.string().min(1) }).strict(), label: "Showing a lesson fragment" },
} as const;

/** The session's course mode, once per session (`["sensei-mode", <session>]`); a host without a host port teaches no kata. */
async function modeOf(runtime: Runtime, ctx: { session: { id: string }; memo<T>(key: unknown, run: () => Promise<T>): Promise<T> }) {
  const port = senseiHostPort(await runtime());
  if (!port) return { port, mode: "interactive" as const };
  return { port, mode: await ctx.memo(["sensei-mode", ctx.session.id], async () => (await port.call<SenseiSessionInfo>("session", ctx.session.id, {})).mode) };
}

/** A kata tool (D17): left out (`null`) for an interactive course; for a kata it calls the host port's `check`, `observe` or `show`,
 *  keyed `<session>:<callId>`, so a rerun step is answered once. */
export function createKataTool(runtime: Runtime, kind: Kata) {
  const tool = tools[kind];
  return defineDynamic(async ctx => {
    const { port, mode } = await modeOf(runtime, ctx as never);
    if (mode !== "katas" || !port) return null;
    return defineTool({
      description: tool.description,
      inputSchema: tool.inputSchema as z.ZodType<Record<string, unknown>>,
      label: { start: () => tool.label },
      execute: async (input, context) => {
        const key = `${context.session.id}:${context.callId}`;
        if (kind === "check") return port.call<LessonCheck>("check", context.session.id, {}, key);
        return port.call(kind, context.session.id, input, key);
      },
    });
  });
}
