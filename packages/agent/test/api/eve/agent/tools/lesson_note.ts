import { defineTool } from "@dojofoo/agent/tools";

export default defineTool({
  description: "Read a lesson note.",
  inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  execute: async () => "# Lesson",
});
