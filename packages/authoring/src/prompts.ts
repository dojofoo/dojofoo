/** Prompts live in Markdown beside their owner; code only fills declared slots.
 * `{{name}}` marks a slot. Every slot must be supplied and every value used, so a
 * renamed placeholder fails loudly instead of shipping a half-rendered prompt.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

/** Read a shipped Markdown file by its `@dojofoo/authoring` export path. Package
 * resolution works the same in Node, Vitest, Vite, tsup bundles and Eve's eval
 * bundle (which rejects `?raw` imports from outside the generated app). */
export function readPrompt(path: string): string {
  return readFileSync(createRequire(import.meta.url).resolve(`@dojofoo/authoring/${path}`), "utf8");
}

const slot = /\{\{([a-zA-Z][\w-]*)\}\}/gu;

export function promptSlots(template: string): string[] {
  return [...new Set([...template.matchAll(slot)].map(match => match[1]!))];
}

export function renderPrompt(template: string, values: Record<string, string> = {}): string {
  const slots = promptSlots(template);
  const missing = slots.filter(name => !(name in values));
  const unused = Object.keys(values).filter(name => !slots.includes(name));
  if (missing.length || unused.length) {
    throw new Error(`Prompt slots mismatch (missing: ${missing.join(", ") || "none"}; unused: ${unused.join(", ") || "none"})`);
  }
  return template.replace(slot, (_, name: string) => values[name]!).trim();
}

/** Split a Markdown file into `## id` sections. Text before the first section is ignored. */
export function promptSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  for (const block of markdown.split(/^## /mu).slice(1)) {
    const newline = block.indexOf("\n");
    const id = (newline === -1 ? block : block.slice(0, newline)).trim();
    if (id in sections) throw new Error(`Duplicate prompt section: ${id}`);
    sections[id] = newline === -1 ? "" : block.slice(newline + 1).trim();
  }
  return sections;
}

export function promptSection(sections: Record<string, string>, id: string): string {
  const section = sections[id];
  if (section === undefined) throw new Error(`Missing prompt section: ${id}`);
  return section;
}
