import { defineInstructions } from "@dojofoo/agent/instructions";
import { readPrompt } from "../prompts.ts";

const read = (path: string) => readPrompt(path).trim();
const withoutFrontmatter = (markdown: string) => markdown.replace(/^---\n[\s\S]*?\n---\n+/u, "");

/** Kyoshi's skills, in Agent Skills layout (`skills/<name>/SKILL.md` plus sibling templates).
 * Composed into the instructions because the native harnesses cannot read
 * Eve-hosted skill folders. Add a style skill beside kata-lessons for each new mode. */
export const kyoshiSkills = {
  "lesson-design": ["SKILL.md"],
  "kata-lessons": ["SKILL.md", "DOJO.tmpl", "SENSEI.tmpl"],
  "teaching-evals": ["SKILL.md"],
} as const;

export function kyoshiInstructions() {
  const skills = Object.entries(kyoshiSkills).flatMap(([skill, files]) =>
    files.map(file => {
      const source = read(`skills/${skill}/${file}`);
      // Templates are shown verbatim under their file name, ready to fill.
      return file.endsWith(".tmpl") ? `### ${file}\n\n\`\`\`md\n${source}\n\`\`\`` : withoutFrontmatter(source);
    }));
  return [read("KYOSHI.md"), ...skills, read("NATIVE-HARNESS.md")].join("\n\n");
}

export default defineInstructions({ content: `${kyoshiInstructions()}\n` });
