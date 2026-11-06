import { defineTool } from "@dojofoo/harness/tools";

export default defineTool({
  description: "Read a lesson note.",
  inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  execute: async () => "# Lesson",
});
