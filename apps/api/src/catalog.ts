import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { Course } from "./app";

function snapshotCourse(slug: string) {
  const catalogRoot = process.env.DOJO_CATALOG_ROOT
    ?? resolve(import.meta.dirname, "../../../dojos");
  const root = resolve(catalogRoot, slug);
  const absoluteFiles: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".DS_Store") continue;
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      if (entry.isFile()) absoluteFiles.push(absolute);
    }
  };
  visit(root);

  return absoluteFiles
    .sort()
    .map((absolute) => ({
      path: relative(root, absolute).split(sep).join("/"),
      contents: readFileSync(absolute, "utf8"),
    }));
}

function course(
  slug: string,
  name: string,
  description: string,
  publishedAt: string,
  categories: string[],
  kataCount: number,
): Course {
  const packageName = `@dojocho/${slug}`;
  const files = snapshotCourse(slug);
  const packageFile = files.find((file) => file.path === "package.json");
  const manifestFile = files.find((file) => file.path === "dojo.json");
  const version = packageFile
    ? (JSON.parse(packageFile.contents) as { version?: string }).version ?? "0.0.0"
    : "0.0.0";
  const hash = createHash("sha256")
    .update(files.map(({ path, contents }) => `${path}\0${contents}`).join("\0"))
    .digest("hex");
  const katas = manifestFile
    ? ((JSON.parse(manifestFile.contents) as {
        katas?: Array<{ name?: string; template?: string }>;
      }).katas ?? []).flatMap(({ name, template }) => {
        if (name) return [name];
        const match = template?.match(/^katas\/([^/]+)\//u);
        return match?.[1] ? [match[1]] : [];
      })
    : [];

  return {
    id: `dojocho/${slug}`,
    slug,
    name,
    source: "dojocho",
    description,
    version,
    publishedAt,
    repository: "tomsiwik/dojocho",
    repositoryUrl: `https://github.com/tomsiwik/dojocho/tree/main/dojos/${slug}`,
    installs: 0,
    sourceType: "npm",
    installUrl: packageName,
    url: `https://dojocho.ai/courses/dojocho/${slug}`,
    categories,
    kataCount: katas.length || kataCount,
    katas,
    hash,
    files,
  };
}

export const courseCatalog: Course[] = [
  course(
    "build-llm",
    "Build an LLM",
    "Build a large language model and a reasoning model from scratch.",
    "2026-05-17T16:33:30.000Z",
    ["Python", "Machine learning", "LLMs"],
    114,
  ),
  course(
    "effect-ts",
    "Effect TS",
    "Master Effect through 40 hands-on katas.",
    "2026-02-14T01:32:25.000Z",
    ["TypeScript", "Functional programming"],
    40,
  ),
  course(
    "pydantic-agents",
    "Pydantic Agents",
    "Learn Pydantic models, validation, and pydantic-ai agents through hands-on katas.",
    "2026-03-03T01:04:30.000Z",
    ["Python", "AI agents", "Data validation"],
    3,
  ),
];
