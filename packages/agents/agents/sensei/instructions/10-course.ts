import { defineDynamic } from "@dojofoo/harness";
import { defineInstructions } from "@dojofoo/harness/instructions";
import { senseiHostPort } from "@dojofoo/agents/sensei/agent";
import { senseiCourseInstructions } from "@dojofoo/agents/sensei/instructions";
import type { SenseiContext, SenseiSessionInfo } from "@dojofoo/protocol";
import { contract } from "../contracts.ts";
import { runtime } from "../runtime.ts";

// A session never changes course or lesson, so its instructions stay fixed for the native agent
export default defineDynamic(async ctx => {
  const port = senseiHostPort(await runtime());
  if (!port) return null;
  const course = await ctx.memo(["sensei-course", ctx.session.id], async () => {
    const session = await port.call<SenseiSessionInfo>("session", ctx.session.id, {});
    // `instructions: true`: this read leaves the "last sent" file marker alone, so the turn's own context still carries the file
    const context = await port.call<SenseiContext>("context", ctx.session.id, { instructions: true });
    return { mode: session.mode, guidance: context.guidance,
      ...(context.kind === "kata" ? { lesson: { source: context.lesson.source, fragmentIds: context.lesson.fragmentIds } } : {}) };
  });
  return defineInstructions({ content: senseiCourseInstructions(course, contract) });
});
