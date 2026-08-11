import type { Course } from "./app";

function course(
  slug: string,
  name: string,
  description: string,
  categories: string[],
  kataCount: number,
  version: string,
): Course {
  const packageName = `@dojocho/${slug}`;
  const manifest = {
    $schema: "https://dojocho.ai/schema/v1/dojo.json",
    name: packageName,
    version,
    description,
  };

  return {
    id: `dojocho/${slug}`,
    slug,
    name,
    source: "dojocho",
    description,
    installs: 0,
    sourceType: "npm",
    installUrl: packageName,
    url: `https://dojocho.ai/courses/dojocho/${slug}`,
    categories,
    kataCount,
    hash: `${slug}-${version}`,
    files: [
      { path: "dojo.json", contents: JSON.stringify(manifest, null, 2) },
      { path: "DOJO.md", contents: `# ${name}\n\n${description}` },
    ],
  };
}

export const courseCatalog: Course[] = [
  course(
    "build-llm",
    "Build an LLM",
    "Build a large language model and a reasoning model from scratch.",
    ["Python", "Machine learning", "LLMs"],
    114,
    "0.0.2",
  ),
  course(
    "effect-ts",
    "Effect TS",
    "Master Effect through 40 hands-on katas.",
    ["TypeScript", "Functional programming"],
    40,
    "0.0.4",
  ),
  course(
    "pydantic-agents",
    "Pydantic Agents",
    "Learn Pydantic models, validation, and pydantic-ai agents through hands-on katas.",
    ["Python", "AI agents", "Data validation"],
    3,
    "0.0.3",
  ),
];
