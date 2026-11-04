import { defineDynamic } from "@dojofoo/agent";
import { defineInstructions } from "@dojofoo/agent/instructions";
import { senseiHostPort } from "@dojofoo/authoring/sensei/agent";
import { senseiCourseInstructions } from "@dojofoo/authoring/sensei/instructions";
import type { InteractiveContext, SenseiSessionInfo } from "@dojofoo/protocol";
import { contract } from "../contracts.ts";
import { runtime } from "../runtime.ts";

// A session never changes course, so its instructions stay fixed for the native agent
export default defineDynamic(async ctx => {
  const port = senseiHostPort(await runtime());
  if (!port) return null;
  const course = await ctx.memo(["sensei-course", ctx.session.id], async () => {
    const session = await port.call<SenseiSessionInfo>("session", ctx.session.id, {});
    const context = await port.call<InteractiveContext>("context", ctx.session.id, {});
    return { mode: session.mode, guidance: context.guidance };
  });
  return defineInstructions({ content: senseiCourseInstructions(course, contract) });
});
