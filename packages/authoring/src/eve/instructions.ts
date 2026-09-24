import { defineInstructions } from "@dojofoo/agent/instructions";
import { readFileSync } from "node:fs";

const kyoshi = readFileSync(new URL(import.meta.resolve("@dojofoo/authoring/KYOSHI.md")), "utf8");

export default defineInstructions({
  content: `${kyoshi}\n\nThe course authoring workspace is /course. Resolve all course-relative paths there, not in Eve's private /workspace. Use the available filesystem tools and dojo_ui_ask; the human edits the same course files.\n`,
});
