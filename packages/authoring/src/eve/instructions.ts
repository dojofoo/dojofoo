import { defineInstructions } from "@dojofoo/agent/instructions";
import { readFileSync } from "node:fs";

const kyoshi = readFileSync(new URL(import.meta.resolve("@dojofoo/authoring/KYOSHI.md")), "utf8");

export default defineInstructions({
  content: `${kyoshi}\n\nYour native harness filesystem tools run in the course repository. Use relative paths: dojo.yaml, DOJO.md, and src/. Eve's virtual /course mount is only for Eve sandbox tools; never pass /course or /workspace to native harness tools. Use dojo_ui_ask for choices; the human edits the same course files.\n`,
});
