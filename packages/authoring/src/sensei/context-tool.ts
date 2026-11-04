import { defineTool } from "@dojofoo/harness/tools";
import { formatKataContext, lessonCapabilities, type SenseiContext } from "@dojofoo/protocol";
import { z } from "zod";
import { senseiHostPort, type SenseiRuntime } from "./agent.ts";

/** `dojo_context`: the current course material on demand, from the UI server's host port. */
export function createSenseiContextTool(runtime: () => Promise<Pick<SenseiRuntime, "hostPort">>) {
  return defineTool({
    description: lessonCapabilities.context.description,
    inputSchema: z.object({}).strict(),
    label: { start: () => "Reading the course" },
    execute: async (_input, context) => {
      const port = senseiHostPort(await runtime());
      if (!port) throw new Error("This Sensei host has no host port.");
      // A rerun step reuses the key, so the host port answers it once (sensei.host-port.rerun-no-duplicate)
      const result = await port.call<SenseiContext>("context", context.session.id, {}, `${context.session.id}:${context.callId}`);
      // A kata reads as the model reads its per-turn context: the file's numbered lines, or that it is unchanged
      return result.kind === "kata" ? formatKataContext(result) : result;
    },
  });
}
