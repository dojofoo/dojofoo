import { defineWorkflowTool } from "@dojofoo/harness/tools";
import { senseiHostPort } from "@dojofoo/agents/sensei/agent";
import { lessonCapabilities, type LessonNavigation, type SenseiSessionInfo } from "@dojofoo/protocol";
import { z } from "zod";
import { runtime } from "../runtime.ts";

const choices = [
  { id: "review", label: "Review", description: "Look back at what this lesson taught before moving on." },
  { id: "move-on", label: "Move on", description: "Open the next lesson." },
  { id: "pause", label: "Pause", description: "Stop here and come back later." },
] as const;

/** `dojo_lesson_complete` (step-5 plan, decision 2): a static workflow tool, because Eve allows no workflow body in a dynamic tool.
 *  The body replays and does no I/O; the mode lookup and the navigation run in steps. An interactive course has no completion. */
export default defineWorkflowTool({
  description: lessonCapabilities.complete.description,
  inputSchema: z.object({}).strict(),
  async execute(_input, ctx) {
    "use workflow";
    if (await sessionMode(ctx.session.id) !== "katas") return { unavailable: "Interactive courses have no completion question." };
    const answer = await ctx.ask({
      prompt: "What would you like to do next?", display: "select", allowFreeform: false,
      options: choices.map(choice => ({ id: choice.id, label: choice.label, description: choice.description })),
    });
    if (answer.status !== "answered") return { decision: answer.status };
    const decision = choices.find(choice => choice.id === answer.optionId || choice.label.toLowerCase() === answer.text?.trim().toLowerCase())?.label
      ?? answer.text ?? answer.optionId ?? "";
    if (decision !== "Move on") return { decision };
    return { decision, next: await navigateNext(ctx.session.id, ctx.callId) };
  },
});

async function sessionMode(sessionId: string): Promise<SenseiSessionInfo["mode"]> {
  "use step";
  const port = senseiHostPort(await runtime());
  if (!port) return "interactive";
  return (await port.call<SenseiSessionInfo>("session", sessionId, {})).mode;
}

async function navigateNext(sessionId: string, callId: string): Promise<LessonNavigation> {
  "use step";
  const port = senseiHostPort(await runtime());
  if (!port) throw new Error("This Sensei host has no host port.");
  return port.call<LessonNavigation>("navigate", sessionId, {}, `${sessionId}:${callId}:navigate`);
}
